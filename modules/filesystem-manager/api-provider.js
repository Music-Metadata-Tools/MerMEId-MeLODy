// Replaces isomorphic-git's network operations (git.clone/git.pull/git.push), which
// previously required a CORS proxy, with direct REST/GraphQL calls against GitHub
// or GitLab. Deliberately implemented without Octokit or any other dependency,
// so it stays runnable without a bundler both in the browser (via importmap) and
// under Node/Vitest - plain fetch() is enough for both.
//
// IMPORTANT: this file deliberately has NO DOM dependency (no document.*).
// Progress/logging run through optional callbacks (onLog/onProgress) that are
// passed in when calling createProvider(...) - this keeps the file unchanged and
// reusable (e.g. in the github-api-playground test project it originally
// came from).

const DEFAULT_PROGRESS_STEP = 1000;
const DEFAULT_CHUNK_SIZE = 100;
const DEFAULT_CHUNK_CONCURRENCY = 5;  // for GitHub batches and tree subdirectory walk
const DEFAULT_FILE_CONCURRENCY = 10;  // for GitLab single-file fallback and tree pages

function noop() {}

export function toBase64(str) {
    const bytes = new TextEncoder().encode(str);
    return btoa(String.fromCharCode(...bytes));
}

export function fromBase64(b64) {
    const binary = atob(b64);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder("utf-8").decode(bytes);
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
        chunks.push(array.slice(i, i + size));
    }
    return chunks;
}

// Retries a failing operation with an exponentially growing delay in
// between (500ms, 1000ms, 2000ms, ...), instead of giving up immediately.
async function withRetry(fn, { retries = 3, baseDelayMs = 500, label = "", onLog = noop } = {}) {
    let lastError;

    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;

            if (attempt < retries) {
                const delay = baseDelayMs * 2 ** attempt;
                onLog(`⚠️ ${label || "Request"} failed (attempt ${attempt + 1}/${retries + 1}), retrying in ${delay}ms...`);
                await sleep(delay);
            }
        }
    }

    throw lastError;
}

// Runs map over all "items", but only "limit" at a time instead of
// running everything sequentially one after another.
async function mapWithConcurrency(items, limit, mapper) {
    const results = new Array(items.length);
    let nextIndex = 0;

    async function worker() {
        while (nextIndex < items.length) {
            const currentIndex = nextIndex++;
            results[currentIndex] = await mapper(items[currentIndex], currentIndex);
        }
    }

    const workerCount = Math.min(limit, items.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));

    return results;
}

// Builds a progress function that triggers the onProgress callback NOT on
// every call, but only every "step" entries (or on the last one) - important
// with thousands of files, so the callback itself doesn't become a
// bottleneck.
function createProgressReporter(onProgress, step) {
    return (current, total, label) => {
        if (current % step === 0 || current === total) {
            onProgress(current, total, label);
        }
    };
}


// ---------------------------------------------------------------------------
// parseRepoUrl / createProvider
// ---------------------------------------------------------------------------

export function parseRepoUrl(url) {

    // Convert the SSH form (git@host:path) into a normal URL, so we can
    // parse both forms (SSH + HTTPS, including ssh://...) with the same
    // URL class.
    const normalized = url.trim().replace(/^git@([^:]+):/, "https://$1/");
    const { hostname, pathname } = new URL(normalized);

    const pathPart = pathname.replace(/^\//, "").replace(/\.git$/, "").replace(/\/+$/, "");

    // Only check the hostname, not the whole URL - otherwise a GitLab project
    // with "github" in its name (e.g. "github-migration-tool") would be
    // misdetected.
    const platform = hostname.includes("github") ? "github" : "gitlab";

    if (platform === "github") {
        const [owner, repo] = pathPart.split("/");
        return { platform, host: hostname, owner, repo };
    }

    // GitLab: the entire remaining path is the project path
    // (can have more than 2 segments with subgroups, e.g. group/subgroup/project)
    return { platform, host: hostname, projectPath: pathPart };
}

export function createProvider(repoUrl, token, options = {}) {
    const parsed = parseRepoUrl(repoUrl);

    return parsed.platform === "github"
        ? createGithubProvider(parsed, token, options)
        : createGitlabProvider(parsed, token, options);
}


// ---------------------------------------------------------------------------
// GitHub
// ---------------------------------------------------------------------------

function createGithubProvider({ owner, repo }, token, {
    onLog = noop,
    onProgress = noop,
    progressStep = DEFAULT_PROGRESS_STEP,
    chunkConcurrency = DEFAULT_CHUNK_CONCURRENCY,
} = {}) {

    const reportProgress = createProgressReporter(onProgress, progressStep);

    async function githubGraphQL(query, variables) {
        const response = await fetch("https://api.github.com/graphql", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ query, variables }),
        });

        const result = await response.json();

        if (!response.ok || result.errors) {
            throw new Error(`GitHub GraphQL error: ${response.status}\n${JSON.stringify(result.errors ?? result)}`);
        }

        return result.data;
    }

    async function githubRest(path) {
        const response = await fetch(`https://api.github.com${path}`, {
            headers: {
                Accept: "application/vnd.github+json",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
        });

        if (!response.ok) {
            throw new Error(`GitHub API error: ${response.status}\n${await response.text()}`);
        }

        return response.json();
    }

    // Fallback for when the recursive tree request gets truncated
    // (>100,000 entries or >7MB): walks the structure directory by directory
    // itself (non-recursive individual calls), so nothing is guaranteed to be
    // missing - just slower, because there are many small requests instead of
    // one big one. Sibling subdirectories run in parallel rather than one
    // after another.
    async function fetchTreeByWalkingDirectories(sha, pathPrefix = "") {
        const treeData = await githubRest(`/repos/${owner}/${repo}/git/trees/${sha}`); // NO ?recursive=1

        const blobs = [];
        const subtrees = [];

        for (const entry of treeData.tree) {
            const entryPath = pathPrefix ? `${pathPrefix}/${entry.path}` : entry.path;

            if (entry.type === "blob") {
                blobs.push({ path: entryPath, sha: entry.sha });
            } else if (entry.type === "tree") {
                subtrees.push({ sha: entry.sha, path: entryPath });
            }
        }

        if (subtrees.length > 0) {
            const nested = await mapWithConcurrency(subtrees, chunkConcurrency, (sub) =>
                fetchTreeByWalkingDirectories(sub.sha, sub.path)
            );
            nested.forEach((subBlobs) => blobs.push(...subBlobs));
        }

        return blobs;
    }

    return {
        platform: "github",
        repoLabel: `${owner}/${repo}`,

        // Lists branch names - used to populate the "add repository" dialog's
        // branch dropdown without needing the Git protocol/CORS proxy at all.
        // GitHub paginates via the "Link" header rather than a total-count
        // header, so - unlike fetchAllFiles()'s tree pagination - this just
        // keeps requesting pages sequentially until a short page confirms
        // there's nothing left; branch lists are normally small enough that
        // this is not worth parallelizing like the file tree is.
        async listBranches() {
            const branches = [];
            let page = 1;

            while (true) {
                const pageBranches = await githubRest(`/repos/${owner}/${repo}/branches?per_page=100&page=${page}`);
                branches.push(...pageBranches.map((b) => b.name));

                if (pageBranches.length < 100) {
                    break;
                }
                page += 1;
            }

            return branches;
        },

        async fetchAllFiles(branch) {

            const treeData = await githubRest(`/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`);

            let blobs;

            if (treeData.truncated) {
                onLog("⚠️ Tree was truncated by GitHub (very large repo) - now loading structure directory by directory...");
                blobs = await fetchTreeByWalkingDirectories(branch);
            } else {
                blobs = treeData.tree.filter((entry) => entry.type === "blob");
            }

            onLog(`Files found according to tree: ${blobs.length}`);

            const chunks = chunkArray(blobs, DEFAULT_CHUNK_SIZE);
            let loadedCount = 0;

            // Multiple batches of 100 run concurrently instead of one after another.
            const fileChunks = await mapWithConcurrency(chunks, chunkConcurrency, async (chunk) => {

                const fields = chunk
                    .map((entry, index) => `file${index}: object(oid: "${entry.sha}") { ... on Blob { text } }`)
                    .join("\n");

                const query = `
                    query($owner: String!, $repo: String!) {
                        repository(owner: $owner, name: $repo) {
                            ${fields}
                        }
                    }
                `;

                const data = await withRetry(
                    () => githubGraphQL(query, { owner, repo }),
                    { label: "Loading GraphQL batch", onLog }
                );

                const chunkFiles = [];

                chunk.forEach((entry, index) => {
                    const blob = data.repository[`file${index}`];

                    if (blob && blob.text !== null) {
                        chunkFiles.push({ path: entry.path, content: blob.text });
                    } else {
                        onLog(`⚠️ Skipped (binary/unreadable): ${entry.path}`);
                    }
                });

                loadedCount += chunk.length;
                reportProgress(Math.min(loadedCount, blobs.length), blobs.length, "Files loaded");

                return chunkFiles;
            });

            return fileChunks.flat();
        },

        async pushFiles(branch, files, message) {

            const headQuery = `
                query($owner: String!, $repo: String!, $qualifiedName: String!) {
                    repository(owner: $owner, name: $repo) {
                        ref(qualifiedName: $qualifiedName) { target { oid } }
                    }
                }
            `;

            const headResult = await githubGraphQL(headQuery, {
                owner, repo,
                qualifiedName: `refs/heads/${branch}`,
            });

            const expectedHeadOid = headResult.repository.ref.target.oid;

            // f.isDeleted is set by the caller (see pushViaApi() below),
            // which knows which paths were removed locally from its own
            // change-tracking (e.g. MerMEId-MeLODy's snapshot.json) - this
            // file itself has no such concept and stays generic.
            const additions = files
                .filter((f) => !f.isDeleted)
                .map((f) => ({
                    path: f.path,
                    contents: toBase64(f.content),
                }));

            const deletions = files
                .filter((f) => f.isDeleted)
                .map((f) => ({ path: f.path }));

            const mutation = `
                mutation($input: CreateCommitOnBranchInput!) {
                    createCommitOnBranch(input: $input) {
                        commit { oid url }
                    }
                }
            `;

            const result = await githubGraphQL(mutation, {
                input: {
                    branch: {
                        repositoryNameWithOwner: `${owner}/${repo}`,
                        branchName: branch,
                    },
                    message: { headline: message },
                    fileChanges: { additions, deletions },
                    expectedHeadOid,
                },
            });

            const commit = result.createCommitOnBranch.commit;
            return { id: commit.oid, url: commit.url };
        },
    };
}


// ---------------------------------------------------------------------------
// GitLab
// ---------------------------------------------------------------------------

function createGitlabProvider({ host, projectPath }, token, {
    onLog = noop,
    onProgress = noop,
    progressStep = DEFAULT_PROGRESS_STEP,
    pageConcurrency = DEFAULT_CHUNK_CONCURRENCY,
    fileConcurrency = DEFAULT_FILE_CONCURRENCY,
} = {}) {

    const apiBase = `https://${host}/api/v4`;
    const projectId = encodeURIComponent(projectPath);
    const reportProgress = createProgressReporter(onProgress, progressStep);

    onLog(`Detected GitLab - host: ${host}, project path: "${projectPath}", encoded: "${projectId}"`);

    async function gitlabRequest(url, options = {}) {
        const response = await fetch(url, {
            ...options,
            headers: {
                ...(token ? { "PRIVATE-TOKEN": token } : {}),
                ...(options.body ? { "Content-Type": "application/json" } : {}),
                ...options.headers,
            },
        });

        if (!response.ok) {
            throw new Error(`GitLab API error: ${response.status}\n${await response.text()}`);
        }

        return { data: await response.json(), headers: response.headers };
    }

    async function gitlabGraphQL(query, variables) {
        const response = await fetch(`https://${host}/api/graphql`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(token ? { "PRIVATE-TOKEN": token } : {}),
            },
            body: JSON.stringify({ query, variables }),
        });

        const result = await response.json();

        if (!response.ok || result.errors) {
            throw new Error(`GitLab GraphQL error: ${response.status}\n${JSON.stringify(result.errors ?? result)}`);
        }

        return result.data;
    }

    // Fast path: GitLab's GraphQL API has a "blobs(paths: [...])" field that
    // returns multiple file contents in ONE request (analogous to GitHub's
    // alias batching). Not necessarily available / named identically on
    // every GitLab version - which is why this is only attempted ONCE (see
    // fetchAllFiles), falling back completely to the proven REST approach on
    // any error, instead of retrying it for every chunk.
    //
    // Field choice: RepositoryBlob has both "plainData" (syntax-HIGHLIGHTED
    // HTML, meant for the web UI - do not use, produces broken Turtle/JSON)
    // and "rawTextBlob" ("Raw content of the blob, if the blob is text
    // data.") - verified directly against GitLab's GraphQL schema
    // (__schema introspection on Repository/RepositoryBlob). rawTextBlob is
    // the one that actually matches what fetchAllFiles() needs.
    //
    // GitLab caps the total size of a single "paths" batch at 20 MiB (also
    // from the schema) - not enforced here explicitly, since a batch that's
    // too large simply fails the request, which withRetry()/the fallback
    // below already handle without special-casing the size.
    async function fetchContentViaGraphQLBatch(paths, branch) {
        const chunks = chunkArray(paths, DEFAULT_CHUNK_SIZE);
        const files = [];
        let loadedCount = 0;

        for (const chunk of chunks) {

            const data = await gitlabGraphQL(
                `query($projectPath: ID!, $paths: [String!]!, $ref: String!) {
                    project(fullPath: $projectPath) {
                        repository {
                            blobs(paths: $paths, ref: $ref) {
                                nodes { path rawTextBlob }
                            }
                        }
                    }
                }`,
                { projectPath, paths: chunk, ref: branch }
            );

            const nodes = data?.project?.repository?.blobs?.nodes;
            if (!nodes) throw new Error("Unexpected response structure for GitLab GraphQL blobs - the field probably doesn't exist on this instance.");

            for (const node of nodes) {
                files.push({ path: node.path, content: node.rawTextBlob });
            }

            loadedCount += chunk.length;
            reportProgress(loadedCount, paths.length, "Files loaded (GraphQL batch)");
        }

        return files;
    }

    return {
        platform: "gitlab",
        repoLabel: `${host}/${projectPath}`,

        // Lists branch names - used to populate the "add repository" dialog's
        // branch dropdown without needing the Git protocol/CORS proxy at all.
        // Same "x-total-pages" pagination pattern as fetchAllFiles() below.
        async listBranches() {
            const baseUrl = `${apiBase}/projects/${projectId}/repository/branches?per_page=100`;

            const firstPage = await withRetry(
                () => gitlabRequest(`${baseUrl}&page=1`),
                { label: "Loading branches page 1", onLog }
            );

            const branches = firstPage.data.map((b) => b.name);
            const totalPages = Number(firstPage.headers.get("x-total-pages") || "1");

            if (totalPages > 1) {
                const remainingPageNumbers = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);

                const remainingResults = await mapWithConcurrency(remainingPageNumbers, pageConcurrency, async (pageNumber) => {
                    const { data: entries } = await withRetry(
                        () => gitlabRequest(`${baseUrl}&page=${pageNumber}`),
                        { label: `Loading branches page ${pageNumber}`, onLog }
                    );
                    return entries.map((b) => b.name);
                });

                remainingResults.forEach((names) => branches.push(...names));
            }

            return branches;
        },

        async fetchAllFiles(branch) {

            // 1. Load structure - the "x-total-pages" response header tells us
            //    right after the first page how many pages there are in total,
            //    so we can load the remaining pages IN PARALLEL instead of
            //    strictly following the "Link" header one by one.
            const baseTreeUrl =
                `${apiBase}/projects/${projectId}/repository/tree` +
                `?recursive=true&per_page=100&ref=${encodeURIComponent(branch)}`;

            const firstPage = await withRetry(
                () => gitlabRequest(`${baseTreeUrl}&page=1`),
                { label: "Loading tree page 1", onLog }
            );

            const blobEntries = firstPage.data.filter((entry) => entry.type === "blob");
            const totalPages = Number(firstPage.headers.get("x-total-pages") || "1");

            if (totalPages > 1) {
                const remainingPageNumbers = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);

                const remainingResults = await mapWithConcurrency(remainingPageNumbers, pageConcurrency, async (pageNumber) => {
                    const { data: entries } = await withRetry(
                        () => gitlabRequest(`${baseTreeUrl}&page=${pageNumber}`),
                        { label: `Loading tree page ${pageNumber}`, onLog }
                    );
                    return entries.filter((entry) => entry.type === "blob");
                });

                remainingResults.forEach((entries) => blobEntries.push(...entries));
            }

            onLog(`Files found according to tree: ${blobEntries.length}`);

            // 2. Load content.
            //
            // Fast path first: fetchContentViaGraphQLBatch() loads many files
            // per request instead of one request per file (see there for the
            // field choice/details). Attempted ONCE for the whole file set -
            // on any failure (e.g. an older GitLab instance without this
            // field, or a batch exceeding GitLab's 20 MiB per-request cap),
            // abandon it entirely and fall back to the proven REST loop
            // below instead of retrying per chunk.
            try {
                const paths = blobEntries.map((entry) => entry.path);
                const files = await fetchContentViaGraphQLBatch(paths, branch);
                onLog(`Loaded ${files.length} files via GraphQL batch.`);
                return files;
            } catch (error) {
                onLog(`⚠️ GraphQL batch loading failed (${error.message}), falling back to per-file REST loading...`);
            }

            // Fallback: one REST request per file, but with limited
            // concurrency + retry.
            let loadedCount = 0;

            const files = await mapWithConcurrency(blobEntries, fileConcurrency, async (entry) => {

                const fileUrl =
                    `${apiBase}/projects/${projectId}/repository/files/${encodeURIComponent(entry.path)}` +
                    `?ref=${encodeURIComponent(branch)}`;

                const { data: fileData } = await withRetry(
                    () => gitlabRequest(fileUrl),
                    { label: `Loading file (${entry.path})`, onLog }
                );

                loadedCount++;
                reportProgress(loadedCount, blobEntries.length, "Files loaded");

                return { path: entry.path, content: fromBase64(fileData.content) };
            });

            return files;
        },

        async pushFiles(branch, files, message) {

            // GitLab's commit API rejects action "update" for a path that
            // doesn't exist yet ("A file with this name doesn't exist") - it
            // needs "create" instead, and a plain "delete" for removed
            // files (no content). f.isNew/f.isDeleted are set by the caller
            // (see pushViaApi() below), which knows this from its own
            // change-tracking (e.g. MerMEId-MeLODy's snapshot.json) - this
            // file itself has no such concept and stays generic.
            const actions = files.map((f) => {
                if (f.isDeleted) {
                    return { action: "delete", file_path: f.path };
                }
                return {
                    action: f.isNew ? "create" : "update",
                    file_path: f.path,
                    content: f.content,
                };
            });

            const commitUrl = `${apiBase}/projects/${projectId}/repository/commits`;

            const { data: commit } = await gitlabRequest(commitUrl, {
                method: "POST",
                body: JSON.stringify({ branch, commit_message: message, actions }),
            });

            return { id: commit.id, url: commit.web_url };
        },
    };
}


// ---------------------------------------------------------------------------
// ensureDir / cloneViaApi / pushViaApi: platform-independent, only work with
// a given "fs" (lightning-fs or compatible) and "provider".
// ---------------------------------------------------------------------------

export async function ensureDir(fs, path) {
    // Lightning-FS does not reliably create ALL missing intermediate
    // directories with { recursive: true } (unlike Node.js) - so we create
    // them ourselves level by level from the root, instead of relying on that.
    const parts = path.split("/").filter(Boolean);
    let current = "";

    for (const part of parts) {
        current += "/" + part;
        try {
            await fs.promises.mkdir(current);
        } catch (err) {
            if (err.code !== "EEXIST") throw err;
        }
    }
}

export async function cloneViaApi({ provider, branch, fs, dir }) {

    await ensureDir(fs, dir);

    const files = await provider.fetchAllFiles(branch);
    const writtenPaths = [];

    for (const file of files) {
        const fullPath = `${dir}/${file.path}`;
        const parentDir = fullPath.substring(0, fullPath.lastIndexOf("/"));

        if (parentDir !== dir) {
            await ensureDir(fs, parentDir);
        }

        await fs.promises.writeFile(fullPath, file.content, "utf8");
        writtenPaths.push(file.path);
    }

    return writtenPaths;
}

export async function pushViaApi({ provider, branch, changedPaths, deletedPaths = new Set(), fs, dir, message, newPaths = new Set() }) {

    if (changedPaths.size === 0 && deletedPaths.size === 0) {
        return null;
    }

    const files = [];

    for (const relativePath of changedPaths) {
        const content = await fs.promises.readFile(`${dir}/${relativePath}`, "utf8");
        files.push({ path: relativePath, content, isNew: newPaths.has(relativePath) });
    }

    // deleted paths don't exist on disk anymore - nothing to read, the
    // provider only needs the path itself (see pushFiles() above).
    for (const relativePath of deletedPaths) {
        files.push({ path: relativePath, isDeleted: true });
    }

    const commit = await provider.pushFiles(branch, files, message);

    changedPaths.clear();
    deletedPaths.clear();

    return commit;
}

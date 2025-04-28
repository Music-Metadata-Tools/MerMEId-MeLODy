export class CredentialsHelper {
  static LAST_CREDENTIALS_KEY = 'lastGitCredentials';

  static async saveCredentials(folder, url, username, token) {
    if (!window.localStorage) {
      return false;
    }

    try {
      const credentials = {
        folder: folder,
        url: url,
        username: username,
        token: token
      };
      
      localStorage.setItem(this.LAST_CREDENTIALS_KEY, JSON.stringify(credentials));
      return true;
    } catch (error) {
      console.warn('Failed to save credentials:', error);
      return false;
    }
  }

  static async getCredentials() {
    if (!window.localStorage) {
      return null; 
    }

    try {
      const storedCredentials = localStorage.getItem(this.LAST_CREDENTIALS_KEY);
      if (storedCredentials) {
        return JSON.parse(storedCredentials);
      }
      return null;
    } catch (error) {
      console.warn('Failed to retrieve credentials:', error);
      return null;
    }
  }
}
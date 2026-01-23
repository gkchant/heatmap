const tenantId = import.meta.env.VITE_MSAL_TENANT_ID || "common";
const clientId = import.meta.env.VITE_MSAL_CLIENT_ID || "";
const redirectUri =
  import.meta.env.VITE_MSAL_REDIRECT_URI || window.location.origin;

export const msalConfig = {
  auth: {
    clientId,
    authority: `https://login.microsoftonline.com/${tenantId}`,
    redirectUri,
    postLogoutRedirectUri: redirectUri,
  },
  cache: {
    cacheLocation: "localStorage",
    storeAuthStateInCookie: false,
  },
};

export const loginRequest = {
  scopes: ["openid", "profile", "email"],
};

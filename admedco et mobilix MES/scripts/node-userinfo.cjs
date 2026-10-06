const os = require("node:os");
try { os.userInfo(); } catch {
  Object.defineProperty(os, "userInfo", { value: () => ({ username: process.env.USERNAME || "operator", uid: -1, gid: -1, shell: null, homedir: process.env.USERPROFILE || process.cwd() }), configurable: true });
}

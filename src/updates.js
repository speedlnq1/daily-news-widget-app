// Auto-update stays OFF until the installer is code-signed.
// Windows only trusts an update if it is signed by the same publisher, so an unsigned build
// must never download and run new installers. Setting build.win.publisherName in package.json
// (to the exact certificate subject, after a certificate exists) is what turns updates on.
function updatesEnabled(pkg) {
  const name = pkg && pkg.build && pkg.build.win && pkg.build.win.publisherName;
  const set = Array.isArray(name) ? name.some(n => typeof n === 'string' && n.trim()) : typeof name === 'string' && name.trim() !== '';
  return !!set;
}
module.exports = { updatesEnabled };

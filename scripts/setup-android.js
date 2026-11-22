// Builds the android/ folder from scratch and applies the Twistack changes.
// Env: TW_TARGET (preview|production), TW_VERSION_NAME, TW_VERSION_CODE
const fs = require("fs"), path = require("path"), { execSync } = require("child_process");
const run = c => { console.log("> " + c); execSync(c, { stdio: "inherit" }); };
const ROOT = path.join(__dirname, "..");
const A = p => path.join(ROOT, "android", p);
const must = (ok, what) => { if (!ok) { console.error("FAILED: " + what); process.exit(1); } console.log("ok - " + what); };

const target = process.env.TW_TARGET === "production" ? "production" : "preview";
const url = target === "production" ? "https://twistackgame.pages.dev" : "https://dev.twistackgame.pages.dev";
const vName = process.env.TW_VERSION_NAME || "1.0.1";
const vCode = parseInt(process.env.TW_VERSION_CODE || "2", 10);

fs.writeFileSync(path.join(ROOT, "capacitor.config.json"), JSON.stringify({
  appId: "com.memogames.twistack",
  appName: "Twistack",
  webDir: "www",
  server: { url, androidScheme: "https", cleartext: false },
  android: { backgroundColor: "#12141d", adjustMarginsForEdgeToEdge: "disable" }
}, null, 2));
console.log("target:", target, url, "version:", vName, vCode);

if (!fs.existsSync(A("."))) run("npx cap add android");
run("npx cap sync android");

// 1) MainActivity (full screen, camera-hole inset)
const javaDir = A("app/src/main/java/com/memogames/twistack");
fs.mkdirSync(javaDir, { recursive: true });
fs.copyFileSync(path.join(ROOT, "native/MainActivity.java"), path.join(javaDir, "MainActivity.java"));
must(true, "MainActivity");

// 2) icons + splash colour: remove the template's pictures, then copy ours
const res = A("app/src/main/res");
for (const d of fs.readdirSync(res)) {
  const full = path.join(res, d);
  if (/^mipmap-/.test(d)) for (const f of fs.readdirSync(full)) if (/^ic_launcher/.test(f)) fs.rmSync(path.join(full, f));
  if (/^drawable/.test(d)) for (const f of fs.readdirSync(full)) if (/^splash\./.test(f)) fs.rmSync(path.join(full, f));
}
const copyDir = (s, d) => { fs.mkdirSync(d, { recursive: true }); for (const f of fs.readdirSync(s)) {
  const sp = path.join(s, f), dp = path.join(d, f); fs.statSync(sp).isDirectory() ? copyDir(sp, dp) : fs.copyFileSync(sp, dp); } };
copyDir(path.join(ROOT, "native/res"), res);
must(true, "icons + splash");

// 3) styles: dark window + dark Android 12 splash
const stP = path.join(res, "values/styles.xml"); let st = fs.readFileSync(stP, "utf8");
st = st.replace(/(<style name="AppTheme\.NoActionBar"[^>]*>)/, '$1\n        <item name="android:windowBackground">@color/tw_bg</item>');
st = st.replace(/(<style name="AppTheme\.NoActionBarLaunch"[^>]*>)/, '$1\n        <item name="windowSplashScreenBackground">@color/tw_bg</item>\n        <item name="windowSplashScreenAnimatedIcon">@mipmap/ic_launcher_foreground</item>');
must(st.includes("windowSplashScreenBackground") && st.includes("android:windowBackground"), "styles");
fs.writeFileSync(stP, st);

// 4) manifest: portrait, app link for Google sign-in, browser tabs
const mfP = A("app/src/main/AndroidManifest.xml"); let mf = fs.readFileSync(mfP, "utf8");
if (!mf.includes('android:screenOrientation')) mf = mf.replace('android:launchMode="singleTask"', 'android:launchMode="singleTask"\n            android:screenOrientation="portrait"');
mf = mf.replace(/<\/activity>/, `    <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="com.memogames.twistack" />
            </intent-filter>
        </activity>`);
if (!mf.includes("<queries>")) mf = mf.replace(/<application/, `<queries>
        <intent><action android:name="android.support.customtabs.action.CustomTabsService" /></intent>
        <intent><action android:name="android.intent.action.VIEW" /><data android:scheme="https" /></intent>
    </queries>

    <application`);
must(mf.includes('android:scheme="com.memogames.twistack"') && mf.includes("screenOrientation"), "manifest");
fs.writeFileSync(mfP, mf);

// 5) version + signing (keystore and passwords come from GitHub secrets)
const gP = A("app/build.gradle"); let g = fs.readFileSync(gP, "utf8");
g = g.replace(/versionCode\s+\d+/, "versionCode " + vCode).replace(/versionName\s+"[^"]*"/, 'versionName "' + vName + '"');
g = g.replace(/buildTypes\s*\{/, `signingConfigs {
        release {
            storeFile file(System.getenv("TW_KEYSTORE") ?: "release.keystore")
            storePassword System.getenv("TW_STORE_PASS")
            keyAlias System.getenv("TW_KEY_ALIAS")
            keyPassword System.getenv("TW_KEY_PASS")
        }
    }
    buildTypes {`);
g = g.replace(/(buildTypes\s*\{\s*release\s*\{)/, "$1\n            signingConfig signingConfigs.release");
must(g.includes("versionCode " + vCode) && g.includes("signingConfig signingConfigs.release"), "gradle version + signing");
fs.writeFileSync(gP, g);
console.log("android project ready");

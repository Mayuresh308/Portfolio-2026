// LOCAL OVERRIDE of the theme's assets/js/hb-mermaid-config.js (bundled after mermaid.min.js on pages with diagrams).
// The theme's version wrapped variables that are already full colours (e.g. --color-secondary-200 =
// "rgb(210 231 216)") in another rgb(...), so Mermaid threw "Unsupported color format" and fell back to its
// default purple theme, with near-invisible edges in dark mode. This one reads the site's colour tokens directly.
(function () {
  const root = document.documentElement;
  const styles = getComputedStyle(root);
  const dark = root.classList.contains("dark");

  // Plain colour tokens, e.g. --hb-color-background: #ffffff
  const color = (name, fallback) => styles.getPropertyValue(name).trim() || fallback;
  // Space-separated RGB triplets, e.g. --hb-primary-500-rgb: 9 105 218
  const triplet = (name, fallback) => {
    const value = styles.getPropertyValue(name).trim();
    return value ? `rgb(${value.split(/\s+/).join(", ")})` : fallback;
  };

  const background = color("--hb-color-background", dark ? "#0d1117" : "#ffffff");
  const foreground = color("--hb-color-foreground", dark ? "#c9d1d9" : "#24292f");
  const surface = color("--hb-color-header-bg", dark ? "#161b22" : "#f6f8fa");
  const muted = color("--hb-color-footer-fg", dark ? "#8b949e" : "#57606a");
  const accent = triplet("--hb-primary-500-rgb", dark ? "#58a6ff" : "#0969da");

  window.mermaid.initialize({
    theme: "base",
    themeVariables: {
      darkMode: dark,
      background,
      primaryColor: surface,
      primaryTextColor: foreground,
      primaryBorderColor: accent,
      secondaryColor: surface,
      secondaryTextColor: foreground,
      secondaryBorderColor: accent,
      tertiaryColor: surface,
      tertiaryTextColor: foreground,
      tertiaryBorderColor: muted,
      lineColor: muted,
      textColor: foreground,
      edgeLabelBackground: background,
      fontFamily: styles.getPropertyValue("font-family"),
      fontSize: "16px",
    },
  });
})();

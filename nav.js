// App version — bump this + add an entry to CHANGELOG.md whenever a
// meaningful set of changes ships, so it's always possible to tell which
// version of the code is live just by opening the side menu.
const APP_VERSION = "1.10.2";

document.addEventListener("DOMContentLoaded", () => {
  const menuBtn = document.getElementById("menuToggle");
  const sideMenu = document.getElementById("sideMenu");
  const backdrop = document.getElementById("backdrop");
  const themeBtn = document.getElementById("themeToggle");

  console.log("Nearby News app version:", APP_VERSION);
  const versionEl = document.getElementById("appVersion");
  if (versionEl) versionEl.textContent = "v" + APP_VERSION;

  // --- NAV MENU ---
  if (menuBtn && sideMenu && backdrop) {
    function openMenu() {
      sideMenu.classList.add("open");
      backdrop.classList.add("show");
    }

    function closeMenu() {
      sideMenu.classList.remove("open");
      backdrop.classList.remove("show");
    }

    menuBtn.addEventListener("click", () => {
      if (sideMenu.classList.contains("open")) {
        closeMenu();
      } else {
        openMenu();
      }
    });

    backdrop.addEventListener("click", closeMenu);

    // Enhancement: Escape key closes the menu, matching what people
    // expect from any overlay/drawer.
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeMenu();
    });
  }

  // Enhancement: highlight whichever nav link matches the current page.
  // Before this, all six links looked identical no matter where you
  // were, so the menu gave no "you are here" feedback.
  if (sideMenu) {
    const currentPage = window.location.pathname.split("/").pop() || "index.html";
    sideMenu.querySelectorAll("a").forEach((link) => {
      const linkPage = link.getAttribute("href");
      if (linkPage === currentPage) {
        link.classList.add("active");
        link.setAttribute("aria-current", "page");
      }
    });
  }

  // --- THEME TOGGLE ---
  const THEME_KEY = "nn_theme"; // 'light' | 'dark'

  function applyTheme(theme) {
    if (theme === "dark") {
      document.body.classList.add("dark");
    } else {
      document.body.classList.remove("dark");
    }
    // Bug fix: the toggle button showed the same 🌓 icon no matter what
    // state you were in — no feedback on what clicking it would do.
    // Now it shows the icon for the theme you'd switch TO.
    if (themeBtn) {
      themeBtn.textContent = theme === "dark" ? "☀️" : "🌙";
      themeBtn.setAttribute(
        "aria-label",
        theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
      );
    }
    // Enhancement: keeps the mobile browser's address-bar/status-bar
    // color in sync with the theme instead of staying one fixed color.
    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    if (themeColorMeta) {
      themeColorMeta.setAttribute("content", theme === "dark" ? "#020617" : "#1e293b");
    }
  }

  // initial from localStorage / prefers-color-scheme
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === "dark" || stored === "light") {
    applyTheme(stored);
  } else {
    const prefersDark =
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    applyTheme(prefersDark ? "dark" : "light");
  }

  if (themeBtn) {
    themeBtn.addEventListener("click", () => {
      const nowDark = !document.body.classList.contains("dark");
      const newTheme = nowDark ? "dark" : "light";
      applyTheme(newTheme);
      localStorage.setItem(THEME_KEY, newTheme);
    });
  }
});

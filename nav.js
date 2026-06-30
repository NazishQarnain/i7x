document.addEventListener("DOMContentLoaded", () => {
  const menuBtn = document.getElementById("menuToggle");
  const sideMenu = document.getElementById("sideMenu");
  const backdrop = document.getElementById("backdrop");
  const themeBtn = document.getElementById("themeToggle");

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
  }

  // --- THEME TOGGLE ---
  const THEME_KEY = "nn_theme"; // 'light' | 'dark'

  function applyTheme(theme) {
    if (theme === "dark") {
      document.body.classList.add("dark");
    } else {
      document.body.classList.remove("dark");
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

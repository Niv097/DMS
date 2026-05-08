const routes = {
  "/": "dashboard",
  "/submit": "submit",
  "/review": "review",
  "/note": "noteDetail",
  "/help": "help",
  "/spoc": "spoc",
  "/submit-memo": "submit-memo"
};

async function loadPage(page) {
    const app = document.getElementById("app");
    if (!app) return;

    try {
        const res = await fetch(`pages/${page}.html`);
        if (!res.ok) throw new Error("Page not found");
        const html = await res.text();
        app.innerHTML = html;
        
        // After loading content, re-initialize any page-specific logic
        if (typeof initPage === 'function') {
            initPage(page);
        }
        
        // Re-init drop zones if on submit page
        if (page === 'submit' && typeof initDropZones === 'function') {
            initDropZones();
        }

        // Update active state in sidebar
        updateSidebarActive(page);

    } catch (err) {
        console.error(err);
        app.innerHTML = `<div class="error-state">
            <h2>404 — Page Not Found</h2>
            <p>The requested page could not be loaded. Please return to the dashboard.</p>
            <a href="#/" class="btn btn-primary">Go to Dashboard</a>
        </div>`;
    }
}

function updateSidebarActive(page) {
    document.querySelectorAll('.sidebar-section a').forEach(a => {
        const href = a.getAttribute('href');
        if (href === `#/${page === 'dashboard' ? '' : page}`) {
            a.classList.add('active');
        } else {
            a.classList.remove('active');
        }
    });
}

function router() {
  let path = location.hash.slice(1) || "/";

  // Normalize path
  if (path === "") path = "/";
  if (path.startsWith("/")) {
      // already good
  } else {
      path = "/" + path;
  }

  const page = routes[path] || "dashboard";
  loadPage(page);
}

window.addEventListener("hashchange", router);
window.addEventListener("load", router);

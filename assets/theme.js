(function () {
    const navLinks = [
        { label: "Ana Sayfa", href: "index.html" },
        { label: "HPLC Kılavuzu", href: "hplc-guide.html" },
        { label: "Kolon Seçimi", href: "hplc-column-selection.html" },
        { label: "Validasyon", href: "hplc-guide/validation/acceptance-criteria.html" }
    ];

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

    function init() {
        addNavigation();
        addTableOfContents();
        loadCodeHighlighting();
    }

    function addNavigation() {
        const nav = document.createElement("nav");
        const basePath = getBasePath();
        const currentPath = normalizePath(window.location.pathname);

        navLinks.forEach(function (link) {
            const a = document.createElement("a");
            a.href = resolveLink(basePath, link.href);
            a.textContent = link.label;

            const linkPath = normalizePath(new URL(a.href, window.location.origin).pathname);
            if (linkPath === currentPath) {
                a.classList.add("is-active");
            }

            nav.appendChild(a);
        });

        document.body.insertBefore(nav, document.body.firstChild);
    }

    function addTableOfContents() {
        const headings = Array.from(document.querySelectorAll("h2, h3"));
        if (headings.length < 3) return;

        const toc = document.createElement("div");
        toc.className = "toc-panel";

        const title = document.createElement("h4");
        title.textContent = "İçindekiler";
        toc.appendChild(title);

        const list = document.createElement("ul");
        list.className = "toc-list";

        headings.forEach(function (heading) {
            if (!heading.id) {
                heading.id = slugify(heading.textContent);
            }

            const item = document.createElement("li");
            const link = document.createElement("a");
            link.href = "#" + heading.id;
            link.textContent = heading.textContent;
            item.appendChild(link);
            list.appendChild(item);
        });

        toc.appendChild(list);

        const firstHeading = document.querySelector("h1, h2");
        if (firstHeading && firstHeading.nextElementSibling) {
            firstHeading.parentNode.insertBefore(toc, firstHeading.nextElementSibling);
        }
    }

    function loadCodeHighlighting() {
        const codeBlocks = document.querySelectorAll("pre code");
        if (!codeBlocks.length) return;

        const hasMermaid = Array.from(codeBlocks).some(function (block) {
            return /language-mermaid/i.test(block.className);
        });

        const hasRegularCode = Array.from(codeBlocks).some(function (block) {
            return !/language-mermaid/i.test(block.className);
        });

        const basePath = getBasePath();

        if (hasRegularCode) {
            loadStyle(resolveLink(basePath, "assets/vendor/prism.min.css"));
            loadScript(resolveLink(basePath, "assets/vendor/prism.min.js")).then(function () {
                if (window.Prism && window.Prism.highlightAll) {
                    window.Prism.highlightAll();
                }
            });
        }

        if (hasMermaid) {
            const mermaidBlocks = Array.from(codeBlocks).filter(function (block) {
                return /language-mermaid/i.test(block.className);
            });

            mermaidBlocks.forEach(function (block) {
                const wrapper = document.createElement("div");
                wrapper.className = "mermaid mermaid-diagram";
                wrapper.textContent = block.textContent;
                const pre = block.closest("pre");
                if (pre && pre.parentNode) {
                    pre.parentNode.replaceChild(wrapper, pre);
                }
            });

            loadScript(resolveLink(basePath, "assets/vendor/mermaid.min.js")).then(function () {
                if (window.mermaid) {
                    window.mermaid.initialize({ startOnLoad: true });
                }
            });
        }
    }

    function getBasePath() {
        const meta = document.querySelector('meta[name="site-base"]');
        const bodyBase = document.body.dataset.base;
        let base = (meta && meta.content) || bodyBase || "/";

        if (!base.startsWith("/")) base = "/" + base;
        if (!base.endsWith("/")) base += "/";

        return base;
    }

    function resolveLink(base, target) {
        const cleaned = target.replace(/^\/+/, "");
        return (base + cleaned).replace(/\/+/g, "/");
    }

    function normalizePath(path) {
        if (!path) return "/";
        let normalized = path;
        if (!normalized.startsWith("/")) normalized = "/" + normalized;
        normalized = normalized.replace(/index\.html$/, "/");
        return normalized;
    }

    function slugify(text) {
        return text
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9çğıöşü\s-]/g, "")
            .replace(/\s+/g, "-")
            .replace(/-+/g, "-") || "section";
    }

    function loadScript(src) {
        return new Promise(function (resolve, reject) {
            const existing = document.querySelector('script[src="' + src + '"]');
            if (existing) {
                resolve();
                return;
            }

            const script = document.createElement("script");
            script.src = src;
            script.async = true;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    function loadStyle(href) {
        const existing = document.querySelector('link[href="' + href + '"]');
        if (existing) return;

        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = href;
        document.head.appendChild(link);
    }
})();

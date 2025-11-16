(function () {
    const readyStates = ["interactive", "complete"];
    if (readyStates.includes(document.readyState)) {
        enhance();
    } else {
        document.addEventListener("DOMContentLoaded", enhance);
    }

    function enhance() {
        const body = document.body;
        if (!body || body.dataset.themeSkip === "true" || body.classList.contains("site-theme-ready")) {
            return;
        }

        body.classList.add("site-theme-ready");

        const shell = document.createElement("div");
        shell.className = "page-shell";

        const main = document.createElement("main");
        main.className = "page-content";
        main.setAttribute("role", "main");

        const existingNodes = Array.from(body.childNodes);
        existingNodes.forEach(function (node) {
            main.appendChild(node);
        });

        const readingTime = estimateReadingTime(main.textContent || "");
        const banner = buildBanner(main, readingTime);

        shell.appendChild(banner);
        shell.appendChild(main);

        body.appendChild(shell);
    }

    function buildBanner(main, readingTime) {
        const header = document.createElement("header");
        header.className = "site-banner";

        const nav = document.createElement("nav");
        nav.className = "site-nav";
        nav.appendChild(buildBrand());
        nav.appendChild(buildNavLinks());

        const bannerGrid = document.createElement("div");
        bannerGrid.className = "banner-grid";

        const hero = document.createElement("div");
        hero.className = "banner-text";
        hero.innerHTML = "" +
            "<p class=\"site-eyebrow\">" + sanitize(getEyebrow()) + "</p>" +
            "<h1>" + sanitize(getHeroTitle(main)) + "</h1>" +
            "<p class=\"site-summary\">" + sanitize(getDescriptor()) + "</p>";

        const metaBox = document.createElement("div");
        metaBox.className = "banner-meta";
        metaBox.innerHTML = buildMeta(readingTime);

        bannerGrid.appendChild(hero);
        bannerGrid.appendChild(metaBox);

        header.appendChild(nav);
        header.appendChild(bannerGrid);

        return header;
    }

    function buildBrand() {
        const wrapper = document.createElement("div");
        wrapper.className = "nav-brand";
        wrapper.innerHTML = "" +
            "<span class=\"brand-title\">HPLC Bilgi Merkezi</span>" +
            "<span class=\"brand-subtitle\">Metot geliştirme, validasyon ve analiz içerikleri</span>";
        return wrapper;
    }

    function buildNavLinks() {
        const wrapper = document.createElement("div");
        wrapper.className = "nav-links";

        const links = [
            { label: "Ana Sayfa", href: "/index.html" },
            { label: "HPLC Kılavuzu", href: "/hplc-guide.html" },
            { label: "Kolon Seçimi", href: "/hplc-column-selection.html" },
            { label: "Validasyon", href: "/hplc-guide/validation/acceptance-criteria.html" }
        ];

        const currentPath = normalizePath(window.location.pathname || "");

        links.forEach(function (link) {
            const anchor = document.createElement("a");
            anchor.href = link.href;
            anchor.textContent = link.label;
            if (currentPath === normalizePath(link.href)) {
                anchor.classList.add("is-active");
            }
            wrapper.appendChild(anchor);
        });

        return wrapper;
    }

    function buildMeta(readingTime) {
        const sectionLabel = getSectionLabel();
        const meta = [
            { label: "Kategori", value: sectionLabel },
            { label: "Okuma", value: readingTime },
            { label: "Durum", value: "Güncel içerik" }
        ];

        return "<ul class=\"meta-grid\">" +
            meta.map(function (item) {
                return "<li><span class=\"meta-label\">" + sanitize(item.label) + "</span><span class=\"meta-value\">" + sanitize(item.value) + "</span></li>";
            }).join("") +
            "</ul>";
    }

    function estimateReadingTime(text) {
        if (!text) {
            return "2 dk";
        }
        const words = text.trim().split(/\s+/).length;
        const minutes = Math.max(2, Math.round(words / 225));
        return minutes + " dk";
    }

    function getHeroTitle(scope) {
        const root = scope || document;
        const prioritySelectors = [".page-title", "h1", "h2"];
        for (let i = 0; i < prioritySelectors.length; i += 1) {
            const node = root.querySelector(prioritySelectors[i]);
            if (node && node.textContent.trim()) {
                return node.textContent.trim();
            }
        }
        return document.title.replace(/Uğur\s+Şahin\s*-\s*/i, "").trim() || "HPLC Kaynakları";
    }

    function getDescriptor() {
        const section = getSectionLabel();
        const map = {
            "Validasyon": "Planlama, raporlama ve SOP belgeleri için pratik rehber notları.",
            "Kolon Seçimi": "Kolon seçimini hızlandıran veri odaklı yöntemler ve kontrol listeleri.",
            "Detektörler": "Farklı dedektör türleri ve kullanım stratejileri hakkında kısa notlar.",
            "Yazılım": "Shimadzu yazılımları ve veri işleme adımlarını kolaylaştıran yönergeler."
        };
        return map[section] || "HPLC metod geliştirme, validasyon ve sorun giderme başlıklarını tek yerde topladım.";
    }

    function getSectionLabel() {
        const path = window.location.pathname || "";
        if (/validation|sop/i.test(path)) {
            return "Validasyon";
        }
        if (/column/i.test(path)) {
            return "Kolon Seçimi";
        }
        if (/detector/i.test(path)) {
            return "Detektörler";
        }
        if (/shimadzu|software/i.test(path)) {
            return "Yazılım";
        }
        if (/guide/i.test(path)) {
            return "HPLC Kılavuzu";
        }
        return "Genel";
    }

    function getEyebrow() {
        const section = getSectionLabel();
        if (section === "Genel") {
            return "HPLC Kaynak Merkezi";
        }
        return section + " İçeriği";
    }

    function sanitize(value) {
        return (value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function normalizePath(path) {
        if (!path) {
            return "/";
        }
        if (!path.startsWith("/")) {
            return "/" + path;
        }
        return path.replace(/index\.html$/, "/");
    }
})();

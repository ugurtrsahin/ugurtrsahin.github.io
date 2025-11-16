import re
import unicodedata
import urllib.parse
from collections import defaultdict
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parent.parent
SKIP_DIRS = {'.git', 'tools'}

# Manual mapping from old relative paths to new relative paths
MAPPING = {
    # Root files
    PurePosixPath('hplc-klavuzu-118b6792444f80f4a5c7f74bcaf6e5ed.html'): PurePosixPath('hplc-guide.html'),
    PurePosixPath('hplc-kolon-seciminde-derin-ogrenme-verimliligi-art-111b6792444f807facc9c4b82de81d94.html'): PurePosixPath('hplc-column-selection.html'),
    
    # Folders
    PurePosixPath('hplc-klavuzu/'): PurePosixPath('hplc-guide/'),
    PurePosixPath('hplc-kolon-seciminde-derin-ogrenme-verimliligi-art/'): PurePosixPath('hplc-column-selection/'),
    
    # hplc-guide subfiles
    PurePosixPath('hplc-klavuzu/hplc-bilgi-kaynaklar-rehberi-106b6792444f8099bf49da32c162c238.html'): PurePosixPath('hplc-guide/info-resources-guide.html'),
    PurePosixPath('hplc-klavuzu/hplc-dedektorlerinin-bilimsel-temelleri-ve-ozellik-122b6792444f806dbd02f125e4dfd099.html'): PurePosixPath('hplc-guide/detectors-guide.html'),
    PurePosixPath('hplc-klavuzu/hplc-metod-gelistirme-rehberi-118b6792444f809b9cf9d0085ab3f7f0.html'): PurePosixPath('hplc-guide/method-development-guide.html'),
    PurePosixPath('hplc-klavuzu/hplc-sorun-cozme-rehberi-118b6792444f806eaf3cda663d87ddad.html'): PurePosixPath('hplc-guide/troubleshooting-guide.html'),
    PurePosixPath('hplc-klavuzu/hplc-validasyon-rehberi-118b6792444f80e999e7dfd8935995d0.html'): PurePosixPath('hplc-guide/validation-guide.html'),
    PurePosixPath('hplc-klavuzu/klavuzlar-07f207859ae84d3dbefb25f654db3c79.html'): PurePosixPath('hplc-guide/guidelines.html'),
    PurePosixPath('hplc-klavuzu/pda-veri-analizinde-pik-saflg-analizinin-temelle-122b6792444f806fb299ec9928d820ab.html'): PurePosixPath('hplc-guide/pda-peak-purity-analysis.html'),
    PurePosixPath('hplc-klavuzu/shimadzu-labsolutionstm-yazlm-gelismis-kullanc-122b6792444f80aaa435db280e15bbb9.html'): PurePosixPath('hplc-guide/shimadzu-software-guide.html'),
    
    # hplc-guide subfolders
    PurePosixPath('hplc-klavuzu/hplc-dedektorlerinin-bilimsel-temelleri-ve-ozellik/'): PurePosixPath('hplc-guide/detectors/'),
    PurePosixPath('hplc-klavuzu/hplc-validasyon-rehberi/'): PurePosixPath('hplc-guide/validation/'),
    PurePosixPath('hplc-klavuzu/klavuzlar/'): PurePosixPath('hplc-guide/guidelines/'),
    PurePosixPath('hplc-klavuzu/shimadzu-labsolutionstm-yazlm-gelismis-kullanc/'): PurePosixPath('hplc-guide/shimadzu/'),
    
    # detectors subfiles
    PurePosixPath('hplc-klavuzu/hplc-dedektorlerinin-bilimsel-temelleri-ve-ozellik/diyot-dizisi-dedektorlerin-dad-bilimsel-temeller-122b6792444f8074ab17eaa67931e1e2.html'): PurePosixPath('hplc-guide/detectors/dad-detectors.html'),
    PurePosixPath('hplc-klavuzu/hplc-dedektorlerinin-bilimsel-temelleri-ve-ozellik/uv-gorunur-dedektorlerin-bilimsel-temelleri-ve-teo-122b6792444f80bc8c22e21ca633cbc4.html'): PurePosixPath('hplc-guide/detectors/uv-visible-detectors.html'),
    
    # validation subfiles
    PurePosixPath('hplc-klavuzu/hplc-validasyon-rehberi/4-prosedur-118b6792444f80ac9fd3c1cbe0f738be.html'): PurePosixPath('hplc-guide/validation/procedure-4.html'),
    PurePosixPath('hplc-klavuzu/hplc-validasyon-rehberi/5-veri-analizi-ve-raporlama-118b6792444f80ee8268ea255282012a.html'): PurePosixPath('hplc-guide/validation/data-analysis-5.html'),
    PurePosixPath('hplc-klavuzu/hplc-validasyon-rehberi/kabul-kriterleri-ve-hesaplama-yontemleri-4621a0e05c414890b4a80e9e09588e8e.html'): PurePosixPath('hplc-guide/validation/acceptance-criteria.html'),
    PurePosixPath('hplc-klavuzu/hplc-validasyon-rehberi/validasyon-icin-standart-operasyon-proseduru-sop-6a58120572b144f38334a080ac6c59e2.html'): PurePosixPath('hplc-guide/validation/sop-main.html'),
    
    # validation/sop subfolder - flatten into validation/
    PurePosixPath('hplc-klavuzu/hplc-validasyon-rehberi/validasyon-icin-standart-operasyon-proseduru-sop/'): PurePosixPath('hplc-guide/validation/sop/'),
    PurePosixPath('hplc-klavuzu/hplc-validasyon-rehberi/validasyon-icin-standart-operasyon-proseduru-sop/ara-kesinlik-intermediate-precision-sop-033cf79ff83142d1b74589647e49eff6.html'): PurePosixPath('hplc-guide/validation/sop/intermediate-precision.html'),
    PurePosixPath('hplc-klavuzu/hplc-validasyon-rehberi/validasyon-icin-standart-operasyon-proseduru-sop/aralk-range-sop-b4f2b8d9bd5c499a8f4b0569ae0f8136.html'): PurePosixPath('hplc-guide/validation/sop/range.html'),
    PurePosixPath('hplc-klavuzu/hplc-validasyon-rehberi/validasyon-icin-standart-operasyon-proseduru-sop/dogruluk-accuracy-08fabc1e34034634aeeae35f0f56b356.html'): PurePosixPath('hplc-guide/validation/sop/accuracy.html'),
    PurePosixPath('hplc-klavuzu/hplc-validasyon-rehberi/validasyon-icin-standart-operasyon-proseduru-sop/dogrusallk-linearity-sop-5d9a39e8df654536b1fdc8c5d68345cb.html'): PurePosixPath('hplc-guide/validation/sop/linearity.html'),
    PurePosixPath('hplc-klavuzu/hplc-validasyon-rehberi/validasyon-icin-standart-operasyon-proseduru-sop/kantitasyon-limiti-loq-sop-13faf03526cb4531adeb23b0a20521ce.html'): PurePosixPath('hplc-guide/validation/sop/loq.html'),
    PurePosixPath('hplc-klavuzu/hplc-validasyon-rehberi/validasyon-icin-standart-operasyon-proseduru-sop/kaytlar-sop-1a37f57004684b47938ed1fba79ae817.html'): PurePosixPath('hplc-guide/validation/sop/records.html'),
    PurePosixPath('hplc-klavuzu/hplc-validasyon-rehberi/validasyon-icin-standart-operasyon-proseduru-sop/kesinlik-precision-sop-d002fcbc57da40928d6222fda2191d70.html'): PurePosixPath('hplc-guide/validation/sop/precision.html'),
    PurePosixPath('hplc-klavuzu/hplc-validasyon-rehberi/validasyon-icin-standart-operasyon-proseduru-sop/on-hazrlk-sop-e1a4c88135d04333b367141a8c6cd572.html'): PurePosixPath('hplc-guide/validation/sop/preparation.html'),
    PurePosixPath('hplc-klavuzu/hplc-validasyon-rehberi/validasyon-icin-standart-operasyon-proseduru-sop/ozgulluk-specificity-sop-cb5b84ea31014b46bb5fa769d57fdcef.html'): PurePosixPath('hplc-guide/validation/sop/specificity.html'),
    PurePosixPath('hplc-klavuzu/hplc-validasyon-rehberi/validasyon-icin-standart-operasyon-proseduru-sop/saglamlk-robustness-sop-b1610c60bb594777a9fcb1da1b8f4ff1.html'): PurePosixPath('hplc-guide/validation/sop/robustness.html'),
    PurePosixPath('hplc-klavuzu/hplc-validasyon-rehberi/validasyon-icin-standart-operasyon-proseduru-sop/sistem-uygunluk-testi-sop-67ad85300cf34a8e8f14a155e9302b37.html'): PurePosixPath('hplc-guide/validation/sop/system-suitability.html'),
    PurePosixPath('hplc-klavuzu/hplc-validasyon-rehberi/validasyon-icin-standart-operasyon-proseduru-sop/tekrarlanabilirlik-repeatability-sop-c7b00a7c42694dfeaaf381e9720cfa6d.html'): PurePosixPath('hplc-guide/validation/sop/repeatability.html'),
    PurePosixPath('hplc-klavuzu/hplc-validasyon-rehberi/validasyon-icin-standart-operasyon-proseduru-sop/tespit-limiti-lod-sop-6f9f91784fc64abba305f23605fedef4.html'): PurePosixPath('hplc-guide/validation/sop/lod.html'),
    PurePosixPath('hplc-klavuzu/hplc-validasyon-rehberi/validasyon-icin-standart-operasyon-proseduru-sop/veri-analizi-ve-raporlama-sop-3c3d9ae8d8ea4ce0b32f56085b4685f0.html'): PurePosixPath('hplc-guide/validation/sop/data-analysis-reporting.html'),
    
    # guidelines PDFs - rename to simple
    PurePosixPath('hplc-klavuzu/klavuzlar/analytical-procedures-and-methods-validation-for-drugs-and-biologics.pdf'): PurePosixPath('hplc-guide/guidelines/analytical-procedures-validation.pdf'),
    PurePosixPath('hplc-klavuzu/klavuzlar/data-integrity-and-compliance.pdf'): PurePosixPath('hplc-guide/guidelines/data-integrity.pdf'),
    PurePosixPath('hplc-klavuzu/klavuzlar/eudralex-volume-4.pdf'): PurePosixPath('hplc-guide/guidelines/eudralex-volume-4.pdf'),
    PurePosixPath('hplc-klavuzu/klavuzlar/good-practices-for-data-management-and-integrity-in-regulated-gmpgdp-environments.pdf'): PurePosixPath('hplc-guide/guidelines/data-management-good-practices.pdf'),
    PurePosixPath('hplc-klavuzu/klavuzlar/guidance-for-industry.pdf'): PurePosixPath('hplc-guide/guidelines/guidance-for-industry.pdf'),
    PurePosixPath('hplc-klavuzu/klavuzlar/guidance-on-good-data-and-record-management-practices.pdf'): PurePosixPath('hplc-guide/guidelines/data-record-management.pdf'),
    PurePosixPath('hplc-klavuzu/klavuzlar/guideline-bioanalytical-method-validation-en.pdf'): PurePosixPath('hplc-guide/guidelines/bioanalytical-method-validation.pdf'),
    PurePosixPath('hplc-klavuzu/klavuzlar/q10-guideline.pdf'): PurePosixPath('hplc-guide/guidelines/q10.pdf'),
    PurePosixPath('hplc-klavuzu/klavuzlar/q11-guideline.pdf'): PurePosixPath('hplc-guide/guidelines/q11.pdf'),
    PurePosixPath('hplc-klavuzu/klavuzlar/q2-r1-guideline.pdf'): PurePosixPath('hplc-guide/guidelines/q2-r1.pdf'),
    PurePosixPath('hplc-klavuzu/klavuzlar/q7-guideline.pdf'): PurePosixPath('hplc-guide/guidelines/q7.pdf'),
    PurePosixPath('hplc-klavuzu/klavuzlar/q8-r2-guideline-1.pdf'): PurePosixPath('hplc-guide/guidelines/q8-r2.pdf'),
    PurePosixPath('hplc-klavuzu/klavuzlar/q9-guideline.pdf'): PurePosixPath('hplc-guide/guidelines/q9.pdf'),
    PurePosixPath('hplc-klavuzu/klavuzlar/validation-of-high-performance-liquid-chromatography-methods-for-pharmaceutical-analysis.pdf'): PurePosixPath('hplc-guide/guidelines/hplc-validation-pharmaceutical.pdf'),
    
    # shimadzu subfiles
    PurePosixPath('hplc-klavuzu/shimadzu-labsolutionstm-yazlm-gelismis-kullanc/labsolutions-ta-veri-analiz-yontemleri-122b6792444f80a6a2e7d5b4c12a3249.html'): PurePosixPath('hplc-guide/shimadzu/data-analysis-methods.html'),
    PurePosixPath('hplc-klavuzu/shimadzu-labsolutionstm-yazlm-gelismis-kullanc/spektral-benzerlik-similarity-temelleri-122b6792444f8083bc47d5ba357b13a4.html'): PurePosixPath('hplc-guide/shimadzu/spectral-similarity.html'),
    PurePosixPath('hplc-klavuzu/shimadzu-labsolutionstm-yazlm-gelismis-kullanc/teknik-terimler-122b6792444f80b6af87dd0ebbd81fc4.html'): PurePosixPath('hplc-guide/shimadzu/technical-terms.html'),
    PurePosixPath('hplc-klavuzu/shimadzu-labsolutionstm-yazlm-gelismis-kullanc/veri-isleme-ve-analiz-122b6792444f804e8240faa15bbdccab.html'): PurePosixPath('hplc-guide/shimadzu/data-processing.html'),
    PurePosixPath('hplc-klavuzu/shimadzu-labsolutionstm-yazlm-gelismis-kullanc/yazlm-bilesenleri-software-components-122b6792444f80638358c160c1b53853.html'): PurePosixPath('hplc-guide/shimadzu/software-components.html'),
    
    # shimadzu subfolder
    PurePosixPath('hplc-klavuzu/shimadzu-labsolutionstm-yazlm-gelismis-kullanc/veri-isleme-ve-analiz/'): PurePosixPath('hplc-guide/shimadzu/data-processing/'),
    PurePosixPath('hplc-klavuzu/shimadzu-labsolutionstm-yazlm-gelismis-kullanc/veri-isleme-ve-analiz/i-pdea-turev-spektrum-kromatogram-yontemi/'): PurePosixPath('hplc-guide/shimadzu/data-processing/ipdea/'),
    PurePosixPath('hplc-klavuzu/shimadzu-labsolutionstm-yazlm-gelismis-kullanc/veri-isleme-ve-analiz/i-pdea-turev-spektrum-kromatogram-yontemi-122b6792444f80eca096ebe3754ea90b.html'): PurePosixPath('hplc-guide/shimadzu/data-processing/ipdea-method.html'),
    PurePosixPath('hplc-klavuzu/shimadzu-labsolutionstm-yazlm-gelismis-kullanc/veri-isleme-ve-analiz/pik-saflg-analizi-122b6792444f80abaa0fd758ecdcc1a4.html'): PurePosixPath('hplc-guide/shimadzu/data-processing/peak-purity-analysis.html'),
    PurePosixPath('hplc-klavuzu/shimadzu-labsolutionstm-yazlm-gelismis-kullanc/veri-isleme-ve-analiz/pik-tanmlama-122b6792444f80e29b29ee3c36fd580a.html'): PurePosixPath('hplc-guide/shimadzu/data-processing/peak-identification.html'),
    PurePosixPath('hplc-klavuzu/shimadzu-labsolutionstm-yazlm-gelismis-kullanc/veri-isleme-ve-analiz/spektral-benzerlik-ve-pik-saflg-analizi-122b6792444f80708cc9ddfbce0f6b73.html'): PurePosixPath('hplc-guide/shimadzu/data-processing/spectral-similarity-peak-purity.html'),
    
    # hplc-column-selection subfiles
    PurePosixPath('hplc-kolon-seciminde-derin-ogrenme-verimliligi-art/data-dosyas-hakknda-111b6792444f802689e4ec65bcfb61e4.html'): PurePosixPath('hplc-column-selection/about-data.html'),
    PurePosixPath('hplc-kolon-seciminde-derin-ogrenme-verimliligi-art/data-dosyas-hakknda/'): PurePosixPath('hplc-column-selection/about-data/'),
    PurePosixPath('hplc-kolon-seciminde-derin-ogrenme-verimliligi-art/data-dosyas-hakknda/kolon.csv'): PurePosixPath('hplc-column-selection/about-data/column.csv'),
    PurePosixPath('hplc-kolon-seciminde-derin-ogrenme-verimliligi-art/1000179504.png'): PurePosixPath('hplc-column-selection/figure1.png'),
    PurePosixPath('hplc-kolon-seciminde-derin-ogrenme-verimliligi-art/1000179505.png'): PurePosixPath('hplc-column-selection/figure2.png'),
    PurePosixPath('hplc-kolon-seciminde-derin-ogrenme-verimliligi-art/1000179506.png'): PurePosixPath('hplc-column-selection/figure3.png'),
    PurePosixPath('hplc-kolon-seciminde-derin-ogrenme-verimliligi-art/1000179507.png'): PurePosixPath('hplc-column-selection/figure4.png'),
    PurePosixPath('hplc-kolon-seciminde-derin-ogrenme-verimliligi-art/1000179508.png'): PurePosixPath('hplc-column-selection/figure5.png'),
}


def should_skip(path: Path) -> bool:
    """Return True if the path is inside a skipped directory."""
    return any(part in SKIP_DIRS for part in path.parts)


def collect_directories():
    """Return relative directory paths (excluding root) sorted by depth ascending."""
    dirs = []
    for path in ROOT.rglob('*'):
        if path.is_dir() and not should_skip(path):
            rel = PurePosixPath(path.relative_to(ROOT).as_posix())
            if str(rel) != '.':
                dirs.append(rel)
    dirs.sort(key=lambda p: len(p.parts))
    return dirs


def collect_files():
    """Return relative file paths sorted by depth ascending."""
    files = []
    for path in ROOT.rglob('*'):
        if path.is_file() and not should_skip(path):
            rel = PurePosixPath(path.relative_to(ROOT).as_posix())
            files.append(rel)
    files.sort(key=lambda p: len(p.parts))
    return files


def plan_new_paths(dirs, files):
    """Create mappings for directories and files to their new paths."""
    dir_new_rel = {}
    file_new_rel = {}
    
    for rel in dirs:
        if rel in MAPPING:
            dir_new_rel[rel] = MAPPING[rel]
        else:
            # If not in mapping, keep as is or slugify, but since we have all, assume all are mapped
            pass
    
    for rel in files:
        if rel in MAPPING:
            file_new_rel[rel] = MAPPING[rel]
        else:
            pass
    
    return dir_new_rel, file_new_rel


def rename_directories(dir_new_rel):
    """Rename directories based on planned paths (process parents before children)."""
    # sort directories by depth so parents are handled before children
    items = sorted(
        [rel for rel in dir_new_rel.keys() if str(rel) != '.'],
        key=lambda p: len(p.parts)
    )
    for rel in items:
        original_name = rel.name
        current_rel = dir_new_rel.get(rel.parent, rel.parent) / original_name
        target_rel = dir_new_rel[rel]
        if current_rel == target_rel:
            continue
        current_path = ROOT.joinpath(*current_rel.parts)
        target_path = ROOT.joinpath(*target_rel.parts)
        target_path.parent.mkdir(parents=True, exist_ok=True)
        current_path.rename(target_path)


def rename_files(file_new_rel, dir_new_rel):
    """Rename files based on planned paths."""
    for rel in sorted(file_new_rel.keys(), key=lambda p: len(p.parts)):
        parent_rel = rel.parent or PurePosixPath('.')
        parent_new_rel = dir_new_rel.get(parent_rel, parent_rel)
        current_rel = parent_new_rel / rel.name
        target_rel = file_new_rel[rel]
        if current_rel == target_rel:
            continue
        current_path = ROOT.joinpath(*current_rel.parts)
        target_path = ROOT.joinpath(*target_rel.parts)
        target_path.parent.mkdir(parents=True, exist_ok=True)
        current_path.rename(target_path)


def update_html_links(mapping):
    """Update HTML files to use new relative paths."""
    html_files = [p for p in ROOT.rglob('*.html') if not should_skip(p)]
    for path in html_files:
        text = path.read_text(encoding='utf-8')
        updated = False
        for old_rel, new_rel in mapping.items():
            old_str = old_rel.as_posix()
            new_str = new_rel.as_posix()
            if old_str in text:
                text = text.replace(old_str, new_str)
                updated = True
            old_encoded = urllib.parse.quote(old_str, safe='/')
            new_encoded = urllib.parse.quote(new_str, safe='/')
            if old_encoded != old_str and old_encoded in text:
                text = text.replace(old_encoded, new_encoded)
                updated = True
        if updated:
            path.write_text(text, encoding='utf-8')


def main():
    dirs = collect_directories()
    files = collect_files()
    dir_new_rel, file_new_rel = plan_new_paths(dirs, files)
    rename_directories(dir_new_rel)
    rename_files(file_new_rel, dir_new_rel)

    # Build mapping for textual replacements
    mapping = {
        rel: new_rel
        for rel, new_rel in {**dir_new_rel, **file_new_rel}.items()
        if rel != new_rel
    }
    if mapping:
        update_html_links(mapping)
    print(f"Renamed {len(dir_new_rel)} directories and {len(file_new_rel)} files.")


if __name__ == '__main__':
    main()
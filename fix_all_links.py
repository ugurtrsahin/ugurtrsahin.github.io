import os
import re
from pathlib import Path

# Mapping of old file/folder names to new names (URL encoded versions)
OLD_TO_NEW = {
    # Root level files
    "HPLC%20K%C4%B1lavuzu%20118b6792444f80f4a5c7f74bcaf6e5ed.html": "hplc-guide.html",
    "HPLC%20Kolon%20Se%C3%A7iminde%20Derin%20%C3%96%C4%9Frenme%20Verimlili%C4%9Fi%20Art%20111b6792444f807facc9c4b82de81d94.html": "hplc-column-selection.html",
    
    # Folder names
    "HPLC%20K%C4%B1lavuzu/": "hplc-guide/",
    "HPLC%20Kolon%20Se%C3%A7iminde%20Derin%20%C3%96%C4%9Frenme%20Verimlili%C4%9Fi%20Art/": "hplc-column-selection/",
    
    # hplc-guide subfolder files
    "HPLC%20Bilgi%20Kaynaklar%C4%B1%20Rehberi%20106b6792444f8099bf49da32c162c238.html": "info-resources-guide.html",
    "HPLC%20Dedetekt%C3%B6rlerinin%20Bilimsel%20Temelleri%20ve%20%C3%96zellik%20122b6792444f806dbd02f125e4dfd099.html": "detectors-guide.html",
    "HPLC%20Metod%20Geli%C5%9Ftirme%20Rehberi%20118b6792444f809b9cf9d0085ab3f7f0.html": "method-development-guide.html",
    "HPLC%20Sorun%20%C3%87%C3%B6zme%20Rehberi%20118b6792444f806eaf3cda663d87ddad.html": "troubleshooting-guide.html",
    "HPLC%20Validasyon%20Rehberi%20118b6792444f80e999e7dfd8935995d0.html": "validation-guide.html",
    "K%C4%B1lavuzlar%2007f207859ae84d3dbefb25f654db3c79.html": "guidelines.html",
    "PDA%20Veri%20Analizinde%20Pik%20Safl%C4%B1%C4%9F%C4%B1%20Analizinin%20Temelle%20122b6792444f806fb299ec9928d820ab.html": "pda-peak-purity-analysis.html",
    "Shimadzu%20LabSolutions%E2%84%A2%20Yaz%C4%B1l%C4%B1m%C4%B1%20Geli%C5%9Fmi%C5%9F%20Kullan%C4%B1c%C4%B1%20122b6792444f80aaa435db280e15bbb9.html": "shimadzu-software-guide.html",
    
    # Subfolders within hplc-guide
    "HPLC%20Dedetekt%C3%B6rlerinin%20Bilimsel%20Temelleri%20ve%20%C3%96zellik/": "detectors/",
    "HPLC%20Validasyon%20Rehberi/": "validation/",
    "K%C4%B1lavuzlar/": "guidelines/",
    "Shimadzu%20LabSolutions%E2%84%A2%20Yaz%C4%B1l%C4%B1m%C4%B1%20Geli%C5%9Fmi%C5%9F%20Kullan%C4%B1c%C4%B1/": "shimadzu/",
    
    # Files in detectors subfolder
    "Diyot%20Dizisi%20Dedekt%C3%B6rlerin%20(DAD)%20Bilimsel%20Temeller%20122b6792444f8074ab17eaa67931e1e2.html": "dad-detectors.html",
    "UV-G%C3%B6r%C3%BCn%C3%BCr%20Dedekt%C3%B6rlerin%20Bilimsel%20Temelleri%20ve%20Teo%20122b6792444f80bc8c22e21ca633cbc4.html": "uv-vis-detectors.html",
    
    # Files in validation subfolder
    "4%20Prosed%C3%BCr%20118b6792444f80ac9fd3c1cbe0f738be.html": "procedure.html",
    "5%20Veri%20Analizi%20ve%20Raporlama%20118b6792444f80ee8268ea255282012a.html": "data-analysis-reporting.html",
    "Kabul%20Kriterleri%20ve%20Hesaplama%20Y%C3%B6ntemleri%204621a0e05c414890b4a80e9e09588e8e.html": "acceptance-criteria.html",
    "Validasyon%20i%C3%A7in%20Standart%20Operasyon%20Prosed%C3%BCr%C3%BC%20(SOP)%206a58120572b144f38334a080ac6c59e2.html": "validation-sop.html",
    
    # Shimadzu subfolder files
    "LabSolutions&#x27;ta%20Veri%20Analiz%20Y%C3%B6ntemleri%20122b6792444f80a6a2e7d5b4c12a3249.html": "data-analysis-methods.html",
    "Spektral%20Benzerlik%20(Similarity)%20Temelleri%20122b6792444f8083bc47d5ba357b13a4.html": "spectral-similarity.html",
    "Teknik%20Terimler%20122b6792444f80b6af87dd0ebbd81fc4.html": "technical-terms.html",
    "Veri%20%C4%B0%C5%9Fleme%20ve%20Analiz%20122b6792444f804e8240faa15bbdccab.html": "data-processing-analysis.html",
    "Yaz%C4%B1l%C4%B1m%20Bile%C5%9Fenleri%20(Software%20Components)%20122b6792444f80638358c160c1b53853.html": "software-components.html",
    
    # hplc-column-selection subfolder files
    "Data%20Dosyas%C4%B1%20Hakk%C4%B1nda%20111b6792444f802689e4ec65bcfb61e4.html": "about-data.html",
}

# Also add non-encoded versions
OLD_TO_NEW_PLAIN = {
    "HPLC Kılavuzu 118b6792444f80f4a5c7f74bcaf6e5ed.html": "hplc-guide.html",
    "HPLC Kolon Seçiminde Derin Öğrenme Verimliliği Art 111b6792444f807facc9c4b82de81d94.html": "hplc-column-selection.html",
    "HPLC Kılavuzu/": "hplc-guide/",
    "HPLC Kolon Seçiminde Derin Öğrenme Verimliliği Art/": "hplc-column-selection/",
    "HPLC Bilgi Kaynakları Rehberi 106b6792444f8099bf49da32c162c238.html": "info-resources-guide.html",
    "HPLC Dedektörlerinin Bilimsel Temelleri ve Özellik 122b6792444f806dbd02f125e4dfd099.html": "detectors-guide.html",
    "HPLC Metod Geliştirme Rehberi 118b6792444f809b9cf9d0085ab3f7f0.html": "method-development-guide.html",
    "HPLC Sorun Çözme Rehberi 118b6792444f806eaf3cda663d87ddad.html": "troubleshooting-guide.html",
    "HPLC Validasyon Rehberi 118b6792444f80e999e7dfd8935995d0.html": "validation-guide.html",
    "Kılavuzlar 07f207859ae84d3dbefb25f654db3c79.html": "guidelines.html",
    "PDA Veri Analizinde Pik Saflığı Analizinin Temelle 122b6792444f806fb299ec9928d820ab.html": "pda-peak-purity-analysis.html",
    "Shimadzu LabSolutions™ Yazılımı Gelişmiş Kullanıcı 122b6792444f80aaa435db280e15bbb9.html": "shimadzu-software-guide.html",
    "HPLC Dedektörlerinin Bilimsel Temelleri ve Özellik/": "detectors/",
    "HPLC Validasyon Rehberi/": "validation/",
    "Kılavuzlar/": "guidelines/",
    "Shimadzu LabSolutions™ Yazılımı Gelişmiş Kullanıcı/": "shimadzu/",
    "Diyot Dizisi Dedektörlerin (DAD) Bilimsel Temeller 122b6792444f8074ab17eaa67931e1e2.html": "dad-detectors.html",
    "UV-Görünür Dedektörlerin Bilimsel Temelleri ve Teo 122b6792444f80bc8c22e21ca633cbc4.html": "uv-vis-detectors.html",
    "4 Prosedür 118b6792444f80ac9fd3c1cbe0f738be.html": "procedure.html",
    "5 Veri Analizi ve Raporlama 118b6792444f80ee8268ea255282012a.html": "data-analysis-reporting.html",
    "Kabul Kriterleri ve Hesaplama Yöntemleri 4621a0e05c414890b4a80e9e09588e8e.html": "acceptance-criteria.html",
    "Validasyon için Standart Operasyon Prosedürü (SOP) 6a58120572b144f38334a080ac6c59e2.html": "validation-sop.html",
    "LabSolutions'ta Veri Analiz Yöntemleri 122b6792444f80a6a2e7d5b4c12a3249.html": "data-analysis-methods.html",
    "Spektral Benzerlik (Similarity) Temelleri 122b6792444f8083bc47d5ba357b13a4.html": "spectral-similarity.html",
    "Teknik Terimler 122b6792444f80b6af87dd0ebbd81fc4.html": "technical-terms.html",
    "Veri İşleme ve Analiz 122b6792444f804e8240faa15bbdccab.html": "data-processing-analysis.html",
    "Yazılım Bileşenleri (Software Components) 122b6792444f80638358c160c1b53853.html": "software-components.html",
    "Data Dosyası Hakkında 111b6792444f802689e4ec65bcfb61e4.html": "about-data.html",
}

def fix_links_in_file(file_path):
    """Fix all old links in an HTML file."""
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original_content = content
    
    # Replace URL-encoded versions first
    for old, new in OLD_TO_NEW.items():
        content = content.replace(old, new)
    
    # Then replace plain versions
    for old, new in OLD_TO_NEW_PLAIN.items():
        # Only replace in href and src attributes
        content = re.sub(
            rf'(href|src)="([^"]*){re.escape(old)}',
            rf'\1="\2{new}',
            content
        )
    
    if content != original_content:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        return True
    return False

def main():
    """Fix all HTML files in the workspace."""
    workspace = Path(r"c:\Users\ugurtrsahin\Desktop\sitem")
    html_files = list(workspace.rglob("*.html"))
    
    fixed_count = 0
    for html_file in html_files:
        if fix_links_in_file(html_file):
            print(f"Fixed: {html_file}")
            fixed_count += 1
    
    print(f"\nTotal files fixed: {fixed_count}")

if __name__ == "__main__":
    main()

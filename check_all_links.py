"""
Comprehensive HTML Link Checker
Scans all HTML files and validates internal links
"""
from pathlib import Path
import re
from urllib.parse import unquote
from collections import defaultdict

class LinkChecker:
    def __init__(self, root_path):
        self.root = Path(root_path)
        self.html_files = set()
        self.all_links = defaultdict(list)  # file -> [(link, line_num)]
        self.broken_links = []
        self.file_exists_cache = {}
        
    def scan_html_files(self):
        """Find all HTML files in the workspace."""
        self.html_files = set(self.root.rglob("*.html"))
        print(f"Found {len(self.html_files)} HTML files\n")
        
    def extract_links(self, html_file):
        """Extract all href links from an HTML file."""
        try:
            with open(html_file, 'r', encoding='utf-8') as f:
                content = f.read()
        except Exception as e:
            print(f"Error reading {html_file}: {e}")
            return []
        
        # Find all href links (excluding external URLs)
        pattern = r'href="([^"]+)"'
        links = []
        
        for line_num, line in enumerate(content.split('\n'), 1):
            for match in re.finditer(pattern, line):
                link = match.group(1)
                # Skip external links, anchors, and special protocols
                if not any([
                    link.startswith('http://'),
                    link.startswith('https://'),
                    link.startswith('#'),
                    link.startswith('mailto:'),
                    link.startswith('tel:'),
                ]):
                    links.append((link, line_num))
        
        return links
    
    def resolve_link(self, html_file, link):
        """Resolve a relative link to absolute path."""
        # URL decode the link
        decoded_link = unquote(link)
        
        # Remove fragment identifier if present
        if '#' in decoded_link:
            decoded_link = decoded_link.split('#')[0]
        
        # Skip empty links
        if not decoded_link or decoded_link == '':
            return None
        
        # Resolve relative to the HTML file's directory
        base_dir = html_file.parent
        target_path = (base_dir / decoded_link).resolve()
        
        return target_path
    
    def file_exists(self, path):
        """Check if file exists (with caching)."""
        path_str = str(path)
        if path_str not in self.file_exists_cache:
            self.file_exists_cache[path_str] = path.exists()
        return self.file_exists_cache[path_str]
    
    def check_all_links(self):
        """Check all links in all HTML files."""
        print("Checking all links...\n")
        
        for html_file in sorted(self.html_files):
            rel_path = html_file.relative_to(self.root)
            links = self.extract_links(html_file)
            
            if links:
                self.all_links[rel_path] = links
                
                for link, line_num in links:
                    target_path = self.resolve_link(html_file, link)
                    
                    if target_path and not self.file_exists(target_path):
                        self.broken_links.append({
                            'file': rel_path,
                            'line': line_num,
                            'link': link,
                            'target': target_path,
                            'decoded': unquote(link)
                        })
    
    def generate_report(self):
        """Generate a comprehensive report."""
        print("=" * 80)
        print("LINK CHECK REPORT")
        print("=" * 80)
        print()
        
        if not self.broken_links:
            print("SUCCESS! All links are valid!")
            print(f"\nTotal HTML files: {len(self.html_files)}")
            total_links = sum(len(links) for links in self.all_links.values())
            print(f"Total links checked: {total_links}")
            return
        
        print(f"Found {len(self.broken_links)} broken link(s):\n")
        
        # Group by source file
        by_file = defaultdict(list)
        for broken in self.broken_links:
            by_file[broken['file']].append(broken)
        
        for file_path, issues in sorted(by_file.items()):
            print(f"\n📄 {file_path}")
            print("-" * 80)
            for issue in issues:
                print(f"  Line {issue['line']:4d}: {issue['link']}")
                if issue['link'] != issue['decoded']:
                    print(f"              Decoded: {issue['decoded']}")
                print(f"              Target: {issue['target']}")
                print()
        
        print("=" * 80)
        print(f"\nTotal broken links: {len(self.broken_links)}")
        print(f"Files with issues: {len(by_file)}")
        print(f"Total files checked: {len(self.html_files)}")
        total_links = sum(len(links) for links in self.all_links.values())
        print(f"Total links checked: {total_links}")
        
    def check_url_encoded_links(self):
        """Find links that still have URL encoding (Turkish chars, spaces, etc)."""
        print("\n" + "=" * 80)
        print("CHECKING FOR URL-ENCODED LINKS")
        print("=" * 80)
        print()
        
        encoded_found = []
        
        for html_file in sorted(self.html_files):
            rel_path = html_file.relative_to(self.root)
            links = self.extract_links(html_file)
            
            for link, line_num in links:
                # Check if link contains URL encoding
                if '%' in link and not link.startswith('http'):
                    encoded_found.append({
                        'file': rel_path,
                        'line': line_num,
                        'link': link,
                        'decoded': unquote(link)
                    })
        
        if not encoded_found:
            print("No URL-encoded internal links found!")
            return
        
        print(f"Found {len(encoded_found)} URL-encoded link(s):\n")
        
        by_file = defaultdict(list)
        for item in encoded_found:
            by_file[item['file']].append(item)
        
        for file_path, issues in sorted(by_file.items()):
            print(f"\n{file_path}")
            print("-" * 80)
            for issue in issues:
                print(f"  Line {issue['line']:4d}:")
                print(f"    Encoded: {issue['link']}")
                print(f"    Decoded: {issue['decoded']}")
                print()

def main():
    workspace = Path(r"c:\Users\ugurtrsahin\Desktop\sitem")
    
    print("Starting comprehensive link check...\n")
    
    checker = LinkChecker(workspace)
    checker.scan_html_files()
    checker.check_all_links()
    checker.generate_report()
    checker.check_url_encoded_links()
    
    print("\n" + "=" * 80)
    print("Link check completed!")
    print("=" * 80)

if __name__ == "__main__":
    main()

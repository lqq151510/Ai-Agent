import zipfile
import xml.etree.ElementTree as ET
import os
import sys

def docx_to_text(docx_path):
    try:
        with zipfile.ZipFile(docx_path) as z:
            # Check if word/document.xml exists
            if 'word/document.xml' not in z.namelist():
                return f"Error: word/document.xml not found in zip structure of {docx_path}"
            
            xml_content = z.read('word/document.xml')
            root = ET.fromstring(xml_content)
            
            # Namespaces
            ns = {
                'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
            }
            
            text_runs = []
            for elem in root.iter():
                if elem.tag.endswith('p'):
                    # Paragraph boundary
                    text_runs.append('\n')
                elif elem.tag.endswith('t'):
                    if elem.text:
                        text_runs.append(elem.text)
            
            return "".join(text_runs)
    except Exception as e:
        return f"Error reading {docx_path}: {e}"

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python read_docx.py <path_to_docx>")
        sys.exit(1)
    
    path = sys.argv[1]
    if not os.path.exists(path):
        print(f"File not found: {path}")
        sys.exit(1)
        
    print(docx_to_text(path))

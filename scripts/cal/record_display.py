"""Readable filing metadata without inferring a project's construction status."""
import re

DOCUMENT_TYPES = {
    'NOE': 'Notice of exemption', 'NOD': 'Notice of determination',
    'NOP': 'Notice of preparation', 'NOI': 'Notice of intent',
    'NOA': 'Notice of availability', 'CON': 'Early consultation notice',
    'EIR': 'Draft environmental impact report', 'SIR': 'Supplemental environmental impact report',
    'SBE': 'Subsequent environmental impact report', 'FIN': 'Final environmental document',
    'NEG': 'Negative declaration', 'MND': 'Mitigated negative declaration',
    'EA': 'Environmental assessment', 'EIS': 'Environmental impact statement',
    'FON': 'Finding of no significant impact', 'OTH': 'Environmental document',
}

def clean(value):
    return re.sub(r'\s+', ' ', str(value or '')).strip()

def excerpt(value, limit=360):
    text = clean(value)
    if len(text) <= limit:
        return text
    # Keep a complete sentence when one fits, otherwise a word-boundary excerpt.
    ends = list(re.finditer(r'[.!?](?:\s|$)', text[:limit]))
    if ends and ends[-1].end() >= 75:
        return text[:ends[-1].start()+1]
    return text[:limit].rsplit(' ', 1)[0].rstrip(' ,;:') + '…'

def display_title(record):
    title = clean(record['name'])
    coded = bool(re.match(r'^\d{4,}[_-]|^[A-Z]{2,}\d{4}-\d+', title) or (re.search(r'[_/]', title) and len(title.split()) < 3))
    if not coded:
        return title
    project = clean(record.get('projectTitle'))
    if project and project != title and not re.match(r'^\d{4,}[_-]', project):
        return project
    description = clean(record.get('description'))
    if description:
        sentence = re.split(r'(?<=[.!?])\s+', description, maxsplit=1)[0]
        return excerpt(sentence, 155)
    return title.replace('_', ' ')

def filing_display(record):
    code = clean(record.get('type')).split(' - ')[0].upper()
    label = DOCUMENT_TYPES.get(code, 'Environmental document')
    description = excerpt(record.get('description'))
    note = description or label + ' filed with the State Clearinghouse. Open the original document for details.'
    return {'title': display_title(record), 'label': label + ' filed', 'summary': note,
            'originalTitle': clean(record['name']), 'documentType': code}

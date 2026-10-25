"""Conservative subject routing for sourced records, independent of filing status."""
import re

TRANSPORT = r'\b(?:transit|transportation|trains?|rail(?:way|road)?|buses|bus\b|bicycle|bikeway|bike lane|cycleway|sidewalk|pedestrian|interchange|highway|freeway|pavement|paving|roadway|roundabout|bridge replacement|street improvements?|traffic|commuter|airport|airfield|crosswalk)\b'
HOUSING = r'\b(?:housing|homes?|apartments?|residential|townhomes?|townhouses?|condominiums?|dwelling|affordable units|renters?|rents?|homeless|tenants?)\b'

def local_headline(title, publisher, name, kind):
    """Match the place in the headline, not in a publisher's name or a county name."""
    if title.endswith(' - '+publisher):title=title[:-len(publisher)-3]
    pattern=r'(?<!\w)'+re.escape(name)+r'(?!\w)'
    local_text=title if kind=='county' else re.sub(pattern+r'\s+County\b','',title,flags=re.I)
    return title if re.search(pattern,local_text,re.I) else None

def article_topic(title):
    if re.search(HOUSING, title, re.I): return 'housing'
    if re.search(TRANSPORT, title, re.I): return 'transportation'
    return 'developments'

def record_type(record):
    title = record.get('projectTitle') or record.get('name') or ''
    development = record.get('developmentType') or ''
    # The source's explicit development category takes priority over words in an address.
    if re.match(r'Residential\b', development, re.I): return 'Residential'
    if re.match(r'Commercial\b', development, re.I): return 'Commercial'
    if re.match(r'Industrial\b', development, re.I): return 'Industrial'
    if record.get('transportation') or re.search(TRANSPORT, title, re.I) or re.match(r'Transportation\b', development, re.I): return 'Transportation'
    if re.search(HOUSING, title, re.I): return 'Residential'
    if re.search(r'\b(?:warehouse|manufacturing|industrial facility)\b', title, re.I): return 'Industrial'
    if re.search(r'\b(?:hotel|retail shop|shopping center|commercial building|office building)\b', title, re.I): return 'Commercial'
    return 'Environmental review'


def civic_news(title, publisher):
    """Keep planning/mobility reporting, excluding social reposts and isolated incidents."""
    if re.search(r'facebook|instagram|youtube|tiktok|reddit|obituar|legacy\.com|business wire|prnewswire', publisher, re.I):
        return False
    policy = re.search(r'\b(?:projects?|plans?|planning|funding|funds|council|commission|budget|improvements?|construction|zoning|permits?|services?)\b', title, re.I)
    incident = re.search(r'\b(?:crash|collision|killed|fatal|stabbing|arrested|sentenced|injuries|injured)\b', title, re.I)
    return bool((policy or re.search(HOUSING+'|'+TRANSPORT, title, re.I)) and (not incident or policy))

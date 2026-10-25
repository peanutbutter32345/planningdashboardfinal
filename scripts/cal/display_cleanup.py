"""Remove navigation text from imported resource labels without rewriting source claims."""
import html
import re

def resource_title(value):
    title=re.sub(r'\s+',' ',html.unescape(value or '')).strip()
    title=re.sub(r'^Go to\s+','',title,flags=re.I)
    words=title.split()
    if len(words)%2==0 and words[:len(words)//2]==words[len(words)//2:]:
        title=' '.join(words[:len(words)//2])
    return title

def board_key(name):
    return re.sub(r'^mayor\s*(?:&|and)\s*','',resource_title(name).lower())

def unique_bodies(bodies):
    result={}
    for body in bodies:
        name=resource_title(body['name'])
        if re.search(r'/events?/',body['url'],re.I):continue
        result.setdefault(board_key(name),{**body,'name':name})
    return list(result.values())

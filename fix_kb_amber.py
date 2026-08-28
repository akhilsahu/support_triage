import re

with open("ui/src/screens/KnowledgeBase.tsx", "r") as f:
    content = f.read()

content = re.sub(r'amber', 'indigo', content)

with open("ui/src/screens/KnowledgeBase.tsx", "w") as f:
    f.write(content)

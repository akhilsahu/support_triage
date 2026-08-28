import re

with open("ui/src/screens/KnowledgeBase.tsx", "r") as f:
    content = f.read()

# Replace emerald with indigo for all highlights/badges
content = re.sub(r'emerald', 'indigo', content)

# Replace the specific amber usage for the Type icon
content = content.replace('bg-amber-50 dark:bg-amber-900/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5', 'bg-indigo-50 dark:bg-indigo-900/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5')
content = content.replace('Type className="w-4 h-4 text-amber-500"', 'Type className="w-4 h-4 text-indigo-500"')

# Replace blue usage for PDF alert
content = content.replace('bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800', 'bg-indigo-50 dark:bg-indigo-900/20 border-b border-indigo-200 dark:border-indigo-800')
content = content.replace('text-blue-700 dark:text-blue-400', 'text-indigo-700 dark:text-indigo-400')

with open("ui/src/screens/KnowledgeBase.tsx", "w") as f:
    f.write(content)

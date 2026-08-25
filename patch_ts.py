import re
with open('app/swap.tsx', 'r') as f:
    content = f.read()
content = content.replace("countdownInterval.current = setInterval(() => {", "countdownInterval.current = setInterval(() => {")
content = content.replace("countdownInterval = useRef<NodeJS.Timeout | null>(null);", "countdownInterval = useRef<any>(null);")
with open('app/swap.tsx', 'w') as f:
    f.write(content)

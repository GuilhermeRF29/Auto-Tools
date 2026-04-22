import pandas as pd
df = pd.read_excel('PERFORMANCE DE CANAIS_COMPARATIVO YoY.xlsx', sheet_name='COMAPRATIVO 25X26 JAN', header=None)
df.iloc[:65, 0:20].to_csv('C:/Users/guilherme.felix/.gemini/antigravity/brain/9474fe29-ed44-4219-89db-1ccda6435163/scratch/excel_dump.csv')

# PyInstaller hook para Selenium
# Inclui automaticamente os webdrivers no pacote
from PyInstaller.utils.hooks import collect_submodules, collect_data_files

# Coletar todos os submodulos do selenium
hiddenimports = collect_submodules('selenium')

# Adicionar imports specificos que podem não ser detectados
hiddenimports += [
    'selenium.webdriver.edge',
    'selenium.webdriver.edge.options',
    'selenium.webdriver.edge.service',
    'selenium.webdriver.common.by',
    'selenium.webdriver.common.desired_capabilities',
    'selenium.webdriver.common.keys',
    'selenium.webdriver.support.ui',
    'selenium.webdriver.support.expected_conditions',
    'selenium.webdriver.support.wait',
]

# Coletar dados do selenium (se houver)
datas = collect_data_files('selenium')

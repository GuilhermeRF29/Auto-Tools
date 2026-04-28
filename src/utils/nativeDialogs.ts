
/**
 * Utilitário para lidar com diálogos de seleção de arquivos e pastas.
 * Tenta usar as APIs nativas do Electron se disponíveis, caso contrário
 * faz fallback para as rotas do backend.
 */

interface AutoToolsRuntime {
  isElectron: boolean;
  openDirectory: () => Promise<string>;
  openExcelFiles: () => Promise<string[]>;
}

declare global {
  interface Window {
    autoToolsRuntime?: AutoToolsRuntime;
  }
}

/**
 * Abre o seletor de pastas nativo (Moderno) ou fallback do backend.
 */
export const pickDirectory = async (): Promise<string> => {
  if (window.autoToolsRuntime?.isElectron) {
    return await window.autoToolsRuntime.openDirectory();
  }

  try {
    const resp = await fetch('/api/abrir-explorador-pastas');
    const data = await resp.json();
    return typeof data?.caminho === 'string' ? data.caminho : '';
  } catch (error) {
    console.error('[PICK_DIR_ERROR]', error);
    return '';
  }
};

/**
 * Abre o seletor de arquivos Excel nativo (Moderno) ou fallback do backend.
 */
export const pickExcelFiles = async (): Promise<string[]> => {
  if (window.autoToolsRuntime?.isElectron) {
    return await window.autoToolsRuntime.openExcelFiles();
  }

  try {
    const resp = await fetch('/api/abrir-explorador-arquivos-excel');
    const data = await resp.json();
    return Array.isArray(data?.caminhos) ? data.caminhos : [];
  } catch (error) {
    console.error('[PICK_FILES_ERROR]', error);
    return [];
  }
};

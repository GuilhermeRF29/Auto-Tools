import { networkInterfaces } from 'os';

/**
 * Obtém o endereço IP local da máquina na rede Wi-Fi/Ethernet.
 * @returns {string} O IP local (ex: 192.168.1.5) ou 'localhost' se não encontrar.
 */
export const getLocalIp = () => {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      // Pula endereços não IPv4 e endereços internos (127.0.0.1)
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
};

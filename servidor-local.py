import os
import socket
import sys
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

PUERTO = 8765
CARPETA = os.path.dirname(os.path.abspath(__file__))


def ocupado():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sonda:
        sonda.settimeout(0.3)
        return sonda.connect_ex(("127.0.0.1", PUERTO)) == 0


def main():
    if ocupado():
        print("Serving HTTP on http://127.0.0.1:%s/ (ya estaba en marcha)" % PUERTO, flush=True)
        return 0
    os.chdir(CARPETA)
    servidor = ThreadingHTTPServer(("127.0.0.1", PUERTO), SimpleHTTPRequestHandler)
    print("Serving HTTP on http://127.0.0.1:%s/" % PUERTO, flush=True)
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        return 0


if __name__ == "__main__":
    sys.exit(main() or 0)

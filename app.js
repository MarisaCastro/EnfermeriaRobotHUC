document.addEventListener("DOMContentLoaded", function () {
    const menus = document.querySelectorAll("details.acordeon");
    const campo = document.getElementById("buscador-global");
    const btnBuscar = document.getElementById("btn-ejecutar-buscar");
    const btnLimpiar = document.getElementById("btn-limpiar-buscar");
    let filtroActivo = false;
    let indiceListo = null;
    let indicePorRuta = null;
    let turno = 0;

    menus.forEach(function (menu) {
        menu.addEventListener("toggle", function () {
            if (filtroActivo || !menu.open) {
                return;
            }
            menus.forEach(function (otro) {
                if (otro !== menu) {
                    otro.open = false;
                }
            });
        });
    });

    if (!campo) {
        return;
    }

    function normalizarTexto(texto) {
        return String(texto || "")
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "");
    }

    function escaparHtml(texto) {
        return String(texto)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
    }

    function planoConOrigen(frase) {
        let plano = "";
        const origen = [];
        for (let i = 0; i < frase.length; i++) {
            const base = frase[i].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            for (let k = 0; k < base.length; k++) {
                plano += base[k];
                origen.push(i);
            }
        }
        return { plano: plano, origen: origen };
    }

    function contarEnTexto(texto, palabra) {
        const plano = normalizarTexto(texto);
        let total = 0;
        let desde = 0;
        while (palabra && desde <= plano.length - palabra.length) {
            const en = plano.indexOf(palabra, desde);
            if (en < 0) {
                break;
            }
            total += 1;
            desde = en + palabra.length;
        }
        return total;
    }

    function contarPalabras(texto, palabras) {
        let total = 0;
        palabras.forEach(function (palabra) {
            total += contarEnTexto(texto, palabra);
        });
        return total;
    }

    function contieneTodas(texto, palabras) {
        const plano = normalizarTexto(texto);
        return palabras.every(function (palabra) {
            return plano.indexOf(palabra) >= 0;
        });
    }

    function htmlDelExtracto(frase, palabras) {
        const mapa = planoConOrigen(frase);
        const marcas = [];
        palabras.forEach(function (palabra) {
            let desde = 0;
            while (palabra && desde <= mapa.plano.length - palabra.length) {
                const en = mapa.plano.indexOf(palabra, desde);
                if (en < 0) {
                    break;
                }
                marcas.push({
                    inicio: mapa.origen[en],
                    fin: mapa.origen[en + palabra.length - 1] + 1
                });
                desde = en + palabra.length;
            }
        });
        marcas.sort(function (a, b) {
            return a.inicio - b.inicio || a.fin - b.fin;
        });
        const unidas = [];
        marcas.forEach(function (marca) {
            const ultima = unidas[unidas.length - 1];
            if (!ultima || marca.inicio > ultima.fin) {
                unidas.push({ inicio: marca.inicio, fin: marca.fin });
            } else if (marca.fin > ultima.fin) {
                ultima.fin = marca.fin;
            }
        });
        marcas.length = 0;
        unidas.forEach(function (marca) {
            marcas.push(marca);
        });
        if (!marcas.length) {
            return escaparHtml(frase);
        }
        const corteDesde = Math.max(0, marcas[0].inicio - 80);
        const corteHasta = Math.min(frase.length, marcas[marcas.length - 1].fin + 80);
        let html = corteDesde > 0 ? "..." : "";
        let cursor = corteDesde;
        marcas.forEach(function (marca) {
            if (marca.fin <= corteDesde || marca.inicio >= corteHasta) {
                return;
            }
            const ini = Math.max(marca.inicio, corteDesde);
            const fin = Math.min(marca.fin, corteHasta);
            if (ini > cursor) {
                html += escaparHtml(frase.slice(cursor, ini));
            }
            html += "<mark>" + escaparHtml(frase.slice(ini, fin)) + "</mark>";
            cursor = fin;
        });
        if (cursor < corteHasta) {
            html += escaparHtml(frase.slice(cursor, corteHasta));
        }
        if (corteHasta < frase.length) {
            html += "...";
        }
        return html;
    }

    function rutaDelEnlace(enlace) {
        const href = enlace.getAttribute("href") || "";
        const consultaUrl = href.indexOf("?") >= 0 ? href.slice(href.indexOf("?") + 1) : "";
        const pdf = new URLSearchParams(consultaUrl).get("pdf") || "";
        try {
            return decodeURIComponent(pdf);
        } catch (error) {
            return pdf;
        }
    }

    function cargarIndice() {
        if (!indiceListo) {
            indiceListo = fetch("indice-busqueda.json")
                .then(function (respuesta) {
                    if (!respuesta.ok) {
                        throw new Error("indice");
                    }
                    return respuesta.json();
                })
                .then(function (datos) {
                    indicePorRuta = new Map();
                    const lista = datos && datos.archivos ? datos.archivos : [];
                    lista.forEach(function (entrada) {
                        const ruta = String(entrada.archivo || "").replace(/\\/g, "/");
                        indicePorRuta.set(normalizarTexto(ruta), entrada.fragmentos || []);
                    });
                    return indicePorRuta;
                });
        }
        return indiceListo;
    }

    function fragmentosDe(ruta) {
        if (!indicePorRuta) {
            return [];
        }
        return indicePorRuta.get(normalizarTexto(ruta)) || [];
    }

    function mostrarAviso(texto) {
        const aviso = document.getElementById("aviso-busqueda");
        if (!aviso) {
            return;
        }
        if (!texto) {
            aviso.style.display = "none";
            aviso.textContent = "";
            return;
        }
        aviso.textContent = texto;
        aviso.style.display = "block";
    }

    function quitarResultados() {
        document.querySelectorAll(".extracto-coincidencia").forEach(function (nodo) {
            nodo.remove();
        });
        document.querySelectorAll(".badge-ocurrencias").forEach(function (nodo) {
            nodo.remove();
        });
        document.querySelectorAll(".capitulo-oculto").forEach(function (nodo) {
            nodo.classList.remove("capitulo-oculto");
        });
    }

    function mostrarCategoria(menu) {
        menu.style.display = "";
        menu.classList.remove("categoria-oculta");
        if (menu.parentElement) {
            menu.parentElement.style.display = "";
            menu.parentElement.classList.remove("categoria-oculta");
        }
    }

    function ocultarCategoria(menu) {
        menu.open = false;
        menu.style.display = "none";
        menu.classList.add("categoria-oculta");
        if (menu.parentElement) {
            menu.parentElement.style.display = "none";
            menu.parentElement.classList.add("categoria-oculta");
        }
    }

    function ponerInsignia(resumen, numero) {
        const insignia = document.createElement("span");
        insignia.className = "badge-ocurrencias";
        insignia.textContent = String(numero);
        resumen.appendChild(insignia);
    }

    function aplicarBusqueda(termino) {
        const palabras = normalizarTexto(termino).split(/\s+/).filter(Boolean);
        quitarResultados();
        filtroActivo = true;
        let totalCapitulos = 0;

        menus.forEach(function (menu) {
            const resumen = menu.querySelector("summary");
            const filas = menu.querySelectorAll(".lista-enlaces > li");
            let ocurrenciasBloque = 0;
            let capitulosBloque = 0;

            filas.forEach(function (fila) {
                const enlace = fila.querySelector("a");
                if (!enlace) {
                    return;
                }
                const titulo = enlace.textContent || "";
                const fragmentos = fragmentosDe(rutaDelEnlace(enlace));
                const textoCapitulo = [titulo].concat(fragmentos).join("\n");
                if (!contieneTodas(textoCapitulo, palabras)) {
                    fila.classList.add("capitulo-oculto");
                    return;
                }
                const ocurrencias = contarPalabras(textoCapitulo, palabras);
                let frase = titulo;
                let mejorCobertura = -1;
                let mejorVeces = -1;
                [titulo].concat(fragmentos).forEach(function (trozo) {
                    const cobertura = palabras.filter(function (palabra) {
                        return normalizarTexto(trozo).indexOf(palabra) >= 0;
                    }).length;
                    const veces = contarPalabras(trozo, palabras);
                    if (cobertura > mejorCobertura || (cobertura === mejorCobertura && veces > mejorVeces)) {
                        mejorCobertura = cobertura;
                        mejorVeces = veces;
                        frase = trozo;
                    }
                });
                capitulosBloque += 1;
                totalCapitulos += 1;
                ocurrenciasBloque += ocurrencias;
                const extracto = document.createElement("p");
                extracto.className = "extracto-coincidencia";
                extracto.innerHTML = htmlDelExtracto(frase, palabras);
                enlace.insertAdjacentElement("afterend", extracto);
            });

            if (capitulosBloque === 0) {
                ocultarCategoria(menu);
                return;
            }

            mostrarCategoria(menu);
            menu.open = false;
            if (resumen) {
                ponerInsignia(resumen, ocurrenciasBloque);
            }
        });

        mostrarAviso("Se han encontrado " + totalCapitulos + " capítulos con la palabra '" + termino + "'");
    }

    function iniciarBusqueda() {
        const termino = campo.value.trim();
        const actual = ++turno;
        if (termino.length < 2) {
            mostrarAviso("Escribe al menos 2 caracteres.");
            return;
        }
        mostrarAviso("Buscando coincidencias en los capítulos, por favor espera un momento...");
        window.setTimeout(function () {
            if (actual !== turno) {
                return;
            }
            cargarIndice().then(function () {
                if (actual !== turno) {
                    return;
                }
                aplicarBusqueda(termino);
            }).catch(function () {
                if (actual !== turno) {
                    return;
                }
                mostrarAviso("No se pudo consultar el índice de búsqueda.");
            });
        }, 200);
    }

    function limpiarBusqueda() {
        turno += 1;
        campo.value = "";
        mostrarAviso("");
        quitarResultados();
        filtroActivo = true;
        menus.forEach(function (menu) {
            menu.open = false;
            mostrarCategoria(menu);
        });
        filtroActivo = false;
    }

    campo.addEventListener("keydown", function (evento) {
        if (evento.key !== "Enter") {
            return;
        }
        evento.preventDefault();
        iniciarBusqueda();
    });

    if (btnBuscar) {
        btnBuscar.addEventListener("click", iniciarBusqueda);
    }
    if (btnLimpiar) {
        btnLimpiar.addEventListener("click", limpiarBusqueda);
    }
});

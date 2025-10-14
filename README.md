# WhatsApp YNAB Bot con Claude AI

Bot de WhatsApp que se integra con YNAB (You Need A Budget) y Claude AI para gestionar finanzas personales mediante chat.

## Características

- 💬 Interacción natural por WhatsApp
- 🤖 Procesamiento inteligente con Claude AI (Sonnet 4)
- 💰 Integración completa con YNAB API
- 📷 Análisis automático de estados de cuenta BCP mediante visión por computadora
- 🏦 Soporte multi-presupuesto (BCP SOLES, BCP DOLARES, USA BANKS)
- 📊 Categorización automática de transacciones
- 🐳 Listo para Docker

## Funcionalidades

1. **Consultar balances y transacciones**
2. **Registrar gastos e ingresos manualmente**
3. **Categorizar transacciones existentes**
4. **Analizar imágenes de estados de cuenta**
   - Extracción automática de transacciones
   - Distinción entre débitos y créditos
   - Sugerencia inteligente de categorías
5. **Análisis financiero y consejos**

## Requisitos

### Variables de Entorno

Crear un archivo `.env` con:

```bash
ANTHROPIC_API_KEY=tu_api_key_de_anthropic
YNAB_API_KEY=tu_api_key_de_ynab
```

### Obtener API Keys

- **Anthropic API Key**: https://console.anthropic.com/
- **YNAB API Key**: https://app.ynab.com/settings/developer

## Instalación y Uso

### Opción 1: Docker (Recomendado)

#### Prerrequisitos
- Docker instalado
- Docker Compose instalado

#### Pasos

1. **Clonar el repositorio**
   ```bash
   git clone <repo-url>
   cd whatsapp-claude-ynab
   ```

2. **Crear archivo .env**
   ```bash
   cp .env.example .env
   # Editar .env con tus API keys
   ```

3. **Crear directorio para datos persistentes**
   ```bash
   mkdir -p data
   ```

4. **Construir y ejecutar con Docker Compose**
   ```bash
   docker-compose up --build
   ```

5. **Escanear código QR**
   - El código QR aparecerá en los logs del contenedor
   - Escanéalo con WhatsApp Web desde tu teléfono
   - La sesión se guardará en `./data/.wwebjs_auth`

6. **Detener el bot**
   ```bash
   docker-compose down
   ```

#### Comandos útiles

```bash
# Ver logs en tiempo real
docker-compose logs -f

# Reiniciar el bot
docker-compose restart

# Reconstruir la imagen después de cambios en el código
docker-compose up --build

# Eliminar contenedor y volúmenes (perderás la sesión de WhatsApp)
docker-compose down -v
```

### Opción 2: Ejecución Local

#### Prerrequisitos
- Node.js 18+ instalado
- Google Chrome instalado (macOS: en `/Applications/`)

#### Pasos

1. **Instalar dependencias**
   ```bash
   npm install
   ```

2. **Crear archivo .env** (ver sección Variables de Entorno)

3. **Ejecutar el bot**
   ```bash
   node bot.js
   ```

4. **Escanear código QR**
   - Aparecerá en la terminal
   - Escanear con WhatsApp Web desde tu teléfono

## Uso del Bot

### Comandos disponibles

- **Consultas generales**:
  - "¿Cuál es mi balance?"
  - "Muéstrame mis transacciones de BCP Soles"
  - "¿Cuánto gasté este mes?"

- **Registrar transacciones**:
  - "Registra un gasto de $50 en Starbucks"
  - "Agrega S/150 en Wong como compras"

- **Procesar estado de cuenta**:
  - Enviar foto del estado de cuenta BCP
  - El bot extraerá automáticamente las transacciones
  - Confirmará antes de crear las transacciones en YNAB

- **Comandos especiales**:
  - `/reset` - Reiniciar conversación
  - `/debug` - Ver estado del historial
  - `/help` - Ver ayuda

### Análisis de Estados de Cuenta

El bot puede procesar imágenes de estados de cuenta BCP:

1. Envía una foto del estado de cuenta al chat
2. El bot detectará automáticamente:
   - Fecha de cada transacción
   - Nombre del comercio
   - Monto (distinguiendo débitos de créditos)
   - Sugerirá categorías basadas en tu configuración de YNAB
3. Preguntará en qué cuenta registrar (BCP Soles o Dólares)
4. Confirmará antes de crear las transacciones

## Estructura del Proyecto

```
whatsapp-claude-ynab/
├── bot.js                 # Código principal del bot
├── package.json           # Dependencias de Node.js
├── .env                   # Variables de entorno (no incluido en repo)
├── Dockerfile            # Configuración de Docker
├── docker-compose.yml    # Orquestación de Docker
├── .dockerignore         # Archivos excluidos de Docker
├── README.md             # Este archivo
└── data/                 # Datos persistentes (creado automáticamente)
    ├── .wwebjs_auth/     # Sesión de WhatsApp
    └── .wwebjs_cache/    # Caché de WhatsApp
```

## Arquitectura Técnica

- **WhatsApp Web.js**: Conexión con WhatsApp
- **Puppeteer**: Automatización del navegador para WhatsApp Web
- **Claude AI (Anthropic)**: Procesamiento de lenguaje natural y visión
- **YNAB API**: Integración con You Need A Budget
- **Docker**: Containerización para fácil despliegue

## Presupuestos YNAB

El bot soporta 3 presupuestos separados:

- **BCP SOLES**: Cuentas en soles peruanos del BCP
- **BCP DOLARES**: Cuentas en dólares del BCP
- **USA BANKS**: Cuentas de bancos USA (sincronización automática)

⚠️ **Nota**: Solo se pueden crear transacciones manualmente en cuentas BCP. Las cuentas USA BANKS se sincronizan automáticamente.

## Solución de Problemas

### Docker

**Error: El contenedor no inicia**
```bash
# Ver logs detallados
docker-compose logs

# Verificar que el .env existe y tiene las API keys
cat .env
```

**Error: No puedo ver el código QR**
```bash
# Ver logs en tiempo real
docker-compose logs -f whatsapp-ynab-bot
```

**Perdí la sesión de WhatsApp**
- La sesión se guarda en `./data/.wwebjs_auth`
- Si eliminas este directorio, tendrás que escanear el QR de nuevo

### Local

**Error: Chrome no encontrado**
- En macOS: Instalar Google Chrome en `/Applications/`
- El bot detectará automáticamente la instalación

**Error: Puppeteer no puede conectarse**
- Verificar que Chrome esté instalado
- Revisar permisos de ejecución

## Seguridad

- ⚠️ **Nunca** compartas tu archivo `.env` ni lo subas a repositorios
- Las API keys tienen acceso completo a tus datos de YNAB y Claude
- La sesión de WhatsApp se guarda localmente encriptada

## Contribuciones

Las contribuciones son bienvenidas. Por favor:
1. Fork el repositorio
2. Crea una rama para tu feature
3. Commit tus cambios
4. Push a la rama
5. Abre un Pull Request

## Licencia

MIT

## Soporte

Si encuentras algún problema o tienes sugerencias, por favor abre un issue en el repositorio.

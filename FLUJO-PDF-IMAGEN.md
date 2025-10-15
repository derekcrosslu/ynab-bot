# 📄 Flujo Completo: Registro de Transacciones desde PDF/Imagen

## 🔄 Diagrama del Flujo

```
┌─────────────────────────────────────────────────────────────────┐
│ PASO 1: Usuario en Menú Principal                               │
│                                                                  │
│ 🏠 Menú Principal                                                │
│                                                                  │
│ Selecciona una opción                                           │
│                                                                  │
│ *1*. Ver balances de cuentas                                    │
│ *2*. Revisar transacciones recientes                            │
│ *3*. Registrar gasto/ingreso (manual)                           │
│ *4*. Categorizar transacciones pendientes                       │
│ *5*. Registrar desde PDF/imagen (múltiples) ⬅️ SELECCIONA ESTO  │
│ *0*. Ayuda / Información                                        │
│                                                                  │
│ ━━━━━━━━━━━━━━━━                                                 │
│ 📍 Status Menu:                                                  │
│ Nivel: 1 - Menú Principal | Estado: ✅ Listo para input         │
└─────────────────────────────────────────────────────────────────┘
                             │
                             │ Usuario: "5"
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ PASO 2: Estado cambia a "waiting_document"                      │
│                                                                  │
│ 📄 Registrar desde PDF/Imagen                                   │
│                                                                  │
│ Envía un PDF o imagen de tu estado de cuenta BCP.              │
│ Puedes escribir 'BCP SOLES' o 'BCP DOLARES' junto con el       │
│ archivo para especificar el presupuesto.                        │
│                                                                  │
│ ━━━━━━━━━━━━━━━━                                                 │
│ 📍 Status Menu:                                                  │
│ Nivel: 2 - Registrar desde PDF/Imagen | Estado: 📄 Esperando... │
└─────────────────────────────────────────────────────────────────┘
                             │
                             │ Usuario: [Envía PDF] + "BCP SOLES 069"
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ PASO 3: Bot procesa PDF                                         │
│                                                                  │
│ 📄 Extrayendo texto del PDF...                                  │
│ ✅ Texto extraído: 15234 caracteres                             │
│                                                                  │
│ Estado: waiting_document → conversation                         │
└─────────────────────────────────────────────────────────────────┘
                             │
                             │ Claude AI procesa
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ PASO 4: Claude ejecuta herramientas en orden                    │
│                                                                  │
│ 1. get_ynab_categories("BCP SOLES")                             │
│    → Obtiene categorías disponibles                             │
│                                                                  │
│ 2. Analiza PDF y extrae 41 transacciones                        │
│    → Lee CARGOS/DEBE (negativos)                                │
│    → Lee ABONOS/HABER (positivos)                               │
│    → Convierte fechas DDMMM → YYYY-MM-DD                        │
│                                                                  │
│ 3. ⚠️ CRÍTICO: cache_extracted_transactions                      │
│    {                                                             │
│      budgetName: "BCP SOLES",                                   │
│      transactions: [41 transacciones...]                        │
│    }                                                             │
│    💾 Guardado en caché temporal (30 min)                       │
│                                                                  │
│ 4. Sugiere categorías para cada transacción                     │
└─────────────────────────────────────────────────────────────────┘
                             │
                             │ Claude responde al usuario
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ PASO 5: Claude muestra lista al usuario                         │
│                                                                  │
│ He extraído 41 transacciones del estado de cuenta BCP:          │
│                                                                  │
│ 1. 01/04/2025 - TRAN.CEL.BM - S/-480.00 (Cellphone)            │
│ 2. 03/04/2025 - FINANCIERA OH - S/-850.00 (sin categoría)      │
│ 3. 05/04/2025 - YAPE RECARGA - S/+50.00 (sin categoría)        │
│ ...                                                              │
│ 41. 30/04/2025 - WONG - S/-156.30 (Groceries)                  │
│                                                                  │
│ ¿En qué cuenta de BCP SOLES quieres registrarlas?              │
│ Por favor dime el número de cuenta (069, 036, o 007)            │
│                                                                  │
│ ━━━━━━━━━━━━━━━━                                                 │
│ 📍 Status Menu:                                                  │
│ Nivel: 2 - Registrar desde PDF/Imagen | Estado: 💬 En conversación│
└─────────────────────────────────────────────────────────────────┘
                             │
                             │ Usuario: "069"
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ PASO 6: Claude procesa confirmación                             │
│                                                                  │
│ 1. get_ynab_accounts("BCP SOLES")                               │
│    → Busca cuenta que contenga "069"                            │
│    → Obtiene accountId: "abc-123-def"                           │
│                                                                  │
│ 2. get_cached_transactions()                                    │
│    → Recupera las 41 transacciones del caché                    │
│    → Valida que no expiró (< 30 min)                            │
│                                                                  │
│ 3. create_multiple_transactions({                               │
│      budgetName: "BCP SOLES",                                   │
│      accountId: "abc-123-def",                                  │
│      transactions: [41 transacciones del caché]                 │
│    })                                                            │
└─────────────────────────────────────────────────────────────────┘
                             │
                             │ YNAB API crea transacciones
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ PASO 7: Claude confirma al usuario                              │
│                                                                  │
│ ✅ ¡Listo! He creado las 41 transacciones en BCP SOLES 069:     │
│                                                                  │
│ • 38 gastos registrados                                         │
│ • 3 ingresos registrados                                        │
│ • Total gastado: S/-4,520.50                                    │
│ • Total recibido: S/+150.00                                     │
│                                                                  │
│ Puedes revisar las transacciones en YNAB. Las que tienen        │
│ categoría sugerida ya están categorizadas.                      │
│                                                                  │
│ Escribe /menu o /done para volver al menú principal.            │
│                                                                  │
│ ━━━━━━━━━━━━━━━━                                                 │
│ 📍 Status Menu:                                                  │
│ Nivel: 2 - Registrar desde PDF/Imagen | Estado: 💬 En conversación│
└─────────────────────────────────────────────────────────────────┘
                             │
                             │ Usuario: "/menu"
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ PASO 8: Volver al menú principal                                │
│                                                                  │
│ 🏠 Menú Principal                                                │
│                                                                  │
│ Selecciona una opción                                           │
│                                                                  │
│ *1*. Ver balances de cuentas                                    │
│ *2*. Revisar transacciones recientes                            │
│ *3*. Registrar gasto/ingreso (manual)                           │
│ *4*. Categorizar transacciones pendientes                       │
│ *5*. Registrar desde PDF/imagen (múltiples)                     │
│ *0*. Ayuda / Información                                        │
│                                                                  │
│ ━━━━━━━━━━━━━━━━                                                 │
│ 📍 Status Menu:                                                  │
│ Nivel: 1 - Menú Principal | Estado: ✅ Listo para input         │
└─────────────────────────────────────────────────────────────────┘
```

## 🔑 Puntos Clave

### Estados del Bot
- **menu**: Usuario navegando con números
- **waiting_document**: Esperando que usuario envíe PDF/imagen
- **conversation**: Claude conversando (extracción, confirmación, creación)
- **processing**: Bot ejecutando acción

### Comandos Útiles
- `/menu` o `/done` - Volver al menú principal en cualquier momento
- `/reset` - Reiniciar todo y limpiar historial
- `/debug` - Ver información del sistema (caché, stats, etc.)

### Flujo de Caché (CRÍTICO)
1. **Extracción** → `cache_extracted_transactions` guarda transacciones
2. **Tiempo de vida**: 30 minutos
3. **Confirmación** → `get_cached_transactions` recupera transacciones
4. **Creación** → `create_multiple_transactions` usa datos del caché

### ⚠️ Importante
- Si el caché expira (>30 min), Claude pedirá que envíes el PDF de nuevo
- El presupuesto debe especificarse: "BCP SOLES" o "BCP DOLARES"
- Solo se pueden crear transacciones en cuentas BCP (no USA BANKS)

## 🎯 Variaciones del Flujo

### Opción 1: Usuario especifica presupuesto con el PDF
```
Usuario: [PDF] + "BCP SOLES 069"
→ Claude extrae, cachea, y pregunta confirmación directa
```

### Opción 2: Usuario no especifica cuenta
```
Usuario: [PDF] + "BCP SOLES"
→ Claude extrae, cachea, lista transacciones, y LUEGO pregunta cuenta
```

### Opción 3: Usuario solo envía PDF
```
Usuario: [PDF]
→ Claude extrae, cachea, y pregunta: ¿BCP SOLES o BCP DOLARES?
→ Luego pregunta: ¿Qué cuenta?
```

## 📊 Ejemplo Real

```
Usuario: "5"

Bot: 📄 Registrar desde PDF/Imagen

     Envía un PDF o imagen...

Usuario: [Adjunta estado_cuenta_abril.pdf] "BCP SOLES 069"

Bot: 📄 Extrayendo texto del PDF...
     ✅ PDF procesado: 15234 caracteres

Bot: He extraído 41 transacciones de tu estado de cuenta BCP de abril:

     1. 01/04 - TRAN.CEL.BM - S/-480.00 (Cellphone)
     2. 03/04 - FINANCIERA OH - S/-850.00 (sin categoría)
     ...
     41. 30/04 - WONG - S/-156.30 (Groceries)

     ¿Confirmas que quieres registrar estas 41 transacciones en BCP SOLES 069?

Usuario: "sí, confirmo"

Bot: ✅ ¡Perfecto! Creando las transacciones...

     ✅ He creado las 41 transacciones en BCP SOLES 069

     Escribe /menu para volver al menú principal.

Usuario: "/menu"

Bot: 🏠 Menú Principal

     Selecciona una opción...
```

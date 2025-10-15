# 🏷️ Flujo Completo: Categorización de Transacciones Pendientes

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
│ *4*. Categorizar transacciones pendientes ⬅️ SELECCIONA ESTO    │
│ *5*. Registrar desde PDF/imagen (múltiples)                     │
│ *0*. Ayuda / Información                                        │
│                                                                  │
│ ━━━━━━━━━━━━━━━━                                                 │
│ 📍 Status Menu:                                                  │
│ Nivel: 1 - Menú Principal | Estado: ✅ Listo para input         │
└─────────────────────────────────────────────────────────────────┘
                             │
                             │ Usuario: "4"
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ PASO 2: Seleccionar Presupuesto                                │
│                                                                  │
│ 🏷️ Categorizar Pendientes                                       │
│                                                                  │
│ ¿De qué presupuesto?                                            │
│                                                                  │
│ *1*. BCP SOLES                                                  │
│ *2*. BCP DOLARES                                                │
│ *3*. USA BANKS                                                  │
│ *0*. ← Volver al menú principal                                 │
│                                                                  │
│ ━━━━━━━━━━━━━━━━                                                 │
│ 📍 Status Menu:                                                  │
│ Nivel: 2 - Categorizar Pendientes | Estado: ✅ Listo para input │
└─────────────────────────────────────────────────────────────────┘
                             │
                             │ Usuario: "1" (BCP SOLES)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ PASO 3: Estado cambia a "conversation"                         │
│                                                                  │
│ Claude ejecuta automáticamente:                                │
│                                                                  │
│ 1. get_ynab_transactions("BCP SOLES")                          │
│    → Obtiene transacciones pendientes de categorización        │
│    → Filtra: unapproved + approved con "Uncategorized"         │
│    → Guarda en caché con índices (1, 2, 3...)                  │
│    → Retorna las primeras 15 transacciones                     │
│                                                                  │
│ 2. get_ynab_categories("BCP SOLES")                            │
│    → Obtiene todas las categorías disponibles                  │
│    → Organiza por grupos                                        │
│    → Retorna lista completa de categorías                      │
│                                                                  │
│ Estado: menu → conversation                                     │
└─────────────────────────────────────────────────────────────────┘
                             │
                             │ Claude analiza
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ PASO 4: Claude analiza y sugiere categorías                    │
│                                                                  │
│ Lógica de sugerencias:                                          │
│ • "Starbucks" / "Cafe" → Eating Out                            │
│ • "Wong" / "Tottus" / "Plaza Vea" → Groceries                  │
│ • "Uber" / "Taxi" / "Gasolina" → Transportation                │
│ • "Netflix" / "Spotify" → Entertainment                         │
│ • "Luz del Sur" → Electric                                      │
│ • "Sedapal" → Water                                             │
│ • "Movistar" / "Claro" → Cellphone                             │
│ • "Bar" / "Discoteca" → Drinks                                  │
│ • Fees bancarios → Fees                                         │
│                                                                  │
│ Solo sugiere categorías que EXISTEN en get_ynab_categories     │
└─────────────────────────────────────────────────────────────────┘
                             │
                             │ Claude responde al usuario
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ PASO 5: Claude muestra sugerencias                             │
│                                                                  │
│ He encontrado 8 transacciones sin categorizar en BCP SOLES:    │
│                                                                  │
│ 1. 15/10/2025 - Starbucks - S/-45.00                           │
│    → Sugiero: Eating Out                                        │
│                                                                  │
│ 2. 16/10/2025 - Wong - S/-156.30                               │
│    → Sugiero: Groceries                                         │
│                                                                  │
│ 3. 17/10/2025 - Uber - S/-28.50                                │
│    → Sugiero: Transportation                                    │
│                                                                  │
│ 4. 18/10/2025 - Netflix - S/-34.90                             │
│    → Sugiero: Entertainment                                     │
│                                                                  │
│ 5. 19/10/2025 - Luz del Sur - S/-85.00                         │
│    → Sugiero: Electric                                          │
│                                                                  │
│ 6. 20/10/2025 - Claro - S/-129.00                              │
│    → Sugiero: Cellphone                                         │
│                                                                  │
│ 7. 21/10/2025 - Bar Central - S/-67.00                         │
│    → Sugiero: Drinks                                            │
│                                                                  │
│ 8. 22/10/2025 - Bank Fee - S/-5.00                             │
│    → Sugiero: Fees                                              │
│                                                                  │
│ ¿Quieres que aplique estas categorizaciones?                   │
│                                                                  │
│ ━━━━━━━━━━━━━━━━                                                 │
│ 📍 Status Menu:                                                  │
│ Nivel: 2 - Categorizar Pendientes | Estado: 💬 En conversación │
└─────────────────────────────────────────────────────────────────┘
                             │
                             │ Usuario: "sí" / "confirmo" / "ok"
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ PASO 6: Claude ejecuta categorizaciones                        │
│                                                                  │
│ Para cada transacción, Claude llama:                           │
│                                                                  │
│ categorize_transaction({                                       │
│   index: 1,                    ← Usa índice del caché         │
│   categoryName: "Eating Out"   ← Nombre EXACTO de categoría   │
│ })                                                              │
│                                                                  │
│ categorize_transaction({                                       │
│   index: 2,                                                     │
│   categoryName: "Groceries"                                    │
│ })                                                              │
│                                                                  │
│ ... (repite para todas las transacciones)                      │
│                                                                  │
│ YNAB API actualiza cada transacción con su categoría          │
└─────────────────────────────────────────────────────────────────┘
                             │
                             │ Todas las categorizaciones completas
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ PASO 7: Claude confirma al usuario                             │
│                                                                  │
│ ✅ ¡Listo! He categorizado 8 transacciones en BCP SOLES:        │
│                                                                  │
│ • Starbucks → Eating Out                                        │
│ • Wong → Groceries                                              │
│ • Uber → Transportation                                         │
│ • Netflix → Entertainment                                       │
│ • Luz del Sur → Electric                                        │
│ • Claro → Cellphone                                             │
│ • Bar Central → Drinks                                          │
│ • Bank Fee → Fees                                               │
│                                                                  │
│ Todas las transacciones están ahora categorizadas en YNAB.     │
│ Puedes revisarlas en tu aplicación.                            │
│                                                                  │
│ Escribe /menu o /done para volver al menú principal.           │
│                                                                  │
│ ━━━━━━━━━━━━━━━━                                                 │
│ 📍 Status Menu:                                                  │
│ Nivel: 2 - Categorizar Pendientes | Estado: 💬 En conversación │
└─────────────────────────────────────────────────────────────────┘
                             │
                             │ Usuario: "/menu"
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ PASO 8: Volver al menú principal                               │
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
- **conversation**: Claude conversando (obteniendo transacciones, sugiriendo, aplicando)
- **processing**: Bot ejecutando acción

### Tipos de Transacciones Sin Categorizar
1. **Unapproved (approved=false)**: Transacciones importadas del banco que el usuario no ha revisado
2. **Uncategorized (approved=true)**: Transacciones aprobadas pero con categoría "Uncategorized"

El bot busca ambos tipos automáticamente.

### Comandos Útiles
- `/menu` o `/done` - Volver al menú principal en cualquier momento
- `/reset` - Reiniciar todo y limpiar historial
- `/debug` - Ver información del sistema (caché, stats, etc.)

### Flujo de Caché para Categorización
1. **get_ynab_transactions** guarda transacciones en caché con índices (1, 2, 3...)
2. **Tiempo de vida**: 30 minutos
3. **categorize_transaction** usa el índice para identificar la transacción rápidamente
4. Si el caché expira, Claude pide que ejecutes get_ynab_transactions de nuevo

### Reglas de Categorización Inteligente

Claude usa estas reglas para sugerir categorías:

| Tipo de Comercio | Palabras Clave | Categoría Sugerida |
|------------------|---------------|-------------------|
| Restaurantes | Starbucks, Cafe, Restaurant | Eating Out |
| Supermercados | Wong, Tottus, Plaza Vea, Metro | Groceries |
| Transporte | Uber, Taxi, Gasolina, Petroperú | Transportation |
| Entretenimiento | Netflix, Spotify, Cineplanet | Entertainment |
| Servicios | Luz del Sur, Sedapal, Movistar, Claro | Electric, Water, Cellphone |
| Bebidas | Bar, Discoteca, Pub | Drinks |
| Fees | Bank Fee, Comisión, Fee | Fees |

**IMPORTANTE**: Claude solo sugiere categorías que EXISTEN en tu presupuesto YNAB. Si una categoría no existe, la transacción queda sin sugerencia.

## 🎯 Variaciones del Flujo

### Opción 1: Usuario acepta todas las sugerencias
```
Usuario: "4" → "1" (BCP SOLES)
Claude: [Muestra 8 sugerencias]
Usuario: "sí, todas"
Claude: [Aplica las 8 categorizaciones]
```

### Opción 2: Usuario rechaza y pide cambios
```
Usuario: "4" → "1" (BCP SOLES)
Claude: [Muestra 8 sugerencias]
Usuario: "No, el de Starbucks debería ser 'Coffee' en lugar de 'Eating Out'"
Claude: [Busca categoría "Coffee" y actualiza la sugerencia]
Usuario: "ahora sí, aplica"
Claude: [Aplica todas con el cambio]
```

### Opción 3: Usuario categoriza manualmente durante conversación
```
Usuario: "4" → "1" (BCP SOLES)
Claude: [Muestra 8 sugerencias]
Usuario: "solo aplica 1, 2 y 3"
Claude: [Aplica solo las 3 primeras]
Claude: "¿Quieres que continúe con las demás?"
```

### Opción 4: No hay transacciones sin categorizar
```
Usuario: "4" → "1" (BCP SOLES)
Claude: [Ejecuta get_ynab_transactions]
Claude: "¡Excelente! No tienes transacciones pendientes de categorizar en BCP SOLES.
        Todas tus transacciones están categorizadas."
```

## 📊 Ejemplo Real

```
Usuario: "4"

Bot: 🏷️ Categorizar Pendientes

     ¿De qué presupuesto?

     *1*. BCP SOLES
     *2*. BCP DOLARES
     *3*. USA BANKS

Usuario: "1"

Bot: [Procesando...]

Bot: He encontrado 5 transacciones sin categorizar en BCP SOLES:

     1. 15/10 - Starbucks - S/-45.00 → Sugiero: Eating Out
     2. 16/10 - Wong - S/-156.30 → Sugiero: Groceries
     3. 17/10 - Uber - S/-28.50 → Sugiero: Transportation
     4. 18/10 - Netflix - S/-34.90 → Sugiero: Entertainment
     5. 19/10 - Luz del Sur - S/-85.00 → Sugiero: Electric

     ¿Quieres que aplique estas categorizaciones?

Usuario: "sí"

Bot: ✅ ¡Perfecto! Aplicando categorizaciones...

     ✅ He categorizado 5 transacciones en BCP SOLES:

     • Starbucks → Eating Out
     • Wong → Groceries
     • Uber → Transportation
     • Netflix → Entertainment
     • Luz del Sur → Electric

     Escribe /menu para volver al menú principal.

Usuario: "/menu"

Bot: 🏠 Menú Principal

     Selecciona una opción...
```

## ⚙️ Detalles Técnicos

### Herramientas Claude que se usan

1. **get_ynab_transactions**
   - Input: `budgetName` (opcional)
   - Output: Transacciones separadas por estado (unapproved, uncategorized)
   - Automáticamente guarda en caché con índices

2. **get_ynab_categories**
   - Input: `budgetName` (opcional)
   - Output: Lista de categorías organizadas por grupos
   - Claude usa esta lista para validar sugerencias

3. **categorize_transaction**
   - Input: `index` (preferido) o `payee`, `categoryName`
   - Output: Transacción actualizada con nueva categoría
   - Usa el caché para identificar rápidamente por índice

### Validaciones

- ✅ categoryName debe ser EXACTO (case-sensitive)
- ✅ Si no encuentra categoría exacta, intenta case-insensitive
- ✅ Si aún no encuentra, retorna error con categorías disponibles
- ✅ Caché expira en 30 minutos
- ✅ Solo sugiere categorías que existen en el presupuesto

## 💡 Tips

- **Revisa las sugerencias**: Claude es inteligente, pero siempre puedes corregir
- **Usa nombres específicos**: Si dices "no, debería ser Coffee", Claude buscará esa categoría
- **Categoriza regularmente**: Es más fácil categorizar 5 transacciones que 50
- **/menu siempre funciona**: Si te pierdes, usa /menu para volver al inicio

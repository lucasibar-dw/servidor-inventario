# Despliegue seguro del recorrido ERP

El backend ya no modifica el esquema al arrancar: `synchronize` está desactivado. La base se actualiza de forma explícita y auditable.

Las migraciones agregan estructura e índices. La tabla `production_line_returns` se crea vacía: no inventa devoluciones ni modifica cantidades. El único backfill funcional marca como liberados los lotes que ya existían al incorporar el circuito de Calidad, según la definición operativa adoptada.

## Antes de publicar

1. En cada depósito que usará el circuito, categorizar una única posición activa como `DEVOLUCION_LINEA`. Es la zona física transitoria y no suma stock disponible.
2. Detener temporalmente las escrituras de usuarios.
3. Desde PowerShell, dentro del servidor, ejecutar:

   ```powershell
   .\scripts\deploy-database.ps1
   ```

   El script crea primero un backup en `backups/`, aplica la base de Producción v1 de forma idempotente y luego las migraciones TypeORM pendientes.
4. Verificar las migraciones:

   ```powershell
   npm run migration:show
   ```

5. Publicar el backend y el frontend compilados.
6. Ejecutar el recorrido de aceptación con una orden de prueba y cantidades pequeñas: declarar, controlar, elegir destino sólo si no hay stock del material en Picking y confirmar el ingreso.

No usar `-SkipBackup` sobre producción. Esa opción existe únicamente para bases descartables de desarrollo.

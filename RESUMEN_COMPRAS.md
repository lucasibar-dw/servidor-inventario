# Resumen de Actualizaciones: Fase 3 (Predicciones y Compras)

**Fecha:** 7 de Abril de 2026

## ¿Qué se hizo en el Backend hoy?
1. **Ampliación Perteneciente al Material (`ItemEntity`)**: Implementados `stockMaximo` y `kilosPorCaja` para manejar lógica de volúmenes de almacenamiento en depósitos en el Dashboard asociado.
2. **Sistema de Consumo Proyectado**: 
   - El servicio `CombosCompraService` ahora cruza los balances de stock de cada material con el **historial de uso (REMITO_SALIDA)** de los últimos 30 días, sacando un ratio diario para deducir cuántos días te quedan para agotar el material.
3. **Módulo `Purchase Orders` Implementado**: 
   - Entidades completamente disjuntas `PurchaseOrderEntity` y `PurchaseOrderLineEntity` en la base de datos (se usa para rastrear pedidos formales pautados con proveedores con su `fechaEntregaEsperada`).
4. **Integración Cruzada (Quiebres vs Llegadas)**:
   - Modificado el servicio de Combos para inyectar estos `Pedidos de Compra` y detectar kilos en camino. Automáticamente se devuelven variables de `incomingStock` y `incomingDate` para que el front las pinte.

## Siguientes Pasos (Para mañana):
- Requerirá que empieces a popular tus datos cargando remitos de salidas para evitar que los consumos estén en 0/null.
- Implementar posibles flujos automáticos entre el Status Completado de la OC y el Remito de Entrada de Stock.

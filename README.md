# Inventario WMS - Backend

Sistema de Gestión de Inventarios (WMS) construido con NestJS.

## Arquitectura

Este proyecto sigue **Clean Architecture**:
*   `src/domain`: Entidades y reglas de negocio puras.
*   `src/application`: Casos de uso.
*   `src/infrastructure`: Implementaciones (Base de datos, Framework, etc).
*   `src/interfaces`: Controladores y adaptadores.

## Requisitos Previos

*   Node.js (v18+)
*   PostgreSQL (Local o en la nube como Render/Neon)

## Configuración

1.  Clonar el repositorio.
2.  Instalar dependencias:
    ```bash
    npm install
    ```
3.  Crear un archivo `.env` en la raíz (basado en el ejemplo):
    ```env
    # Database
    DATABASE_HOST=tuhostdesdelaultimasesion
    DATABASE_PORT=5432
    DATABASE_USERNAME=tuusuario
    DATABASE_PASSWORD=tupassword
    DATABASE_NAME=tudb
    
    # Auth
    JWT_SECRET=super-secret-key-change-in-prod
    ```
    *Nota: Si usas Render, estos valores ya están en tu dashboard, pero para local necesitas el .env*

## Ejecutar

```bash
# Desarrollo
npm run start:dev

# Producción
npm run build
npm run start:prod
```

## Funcionalidades Actuales
*   Gestión de Artículos (Items).
*   Movimientos de Inventario (Entradas).
*   Autenticación JWT (Usuario Admin se crea autom. al inicio si no existe: `admin` / `Admin258$$`).

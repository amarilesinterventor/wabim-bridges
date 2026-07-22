# Modelo Entidad-Relación (ERD) — WABIM Bridges

Este diagrama corresponde al esquema PostgreSQL objetivo (`prisma/schema.prisma` /
`sql/postgresql_schema.sql`). La demostración en este entregable usa un espejo
funcional en SQLite (`src/db/schema.sql`) por no tener acceso a internet en el
entorno de generación (ver `README.md`, sección "Nota sobre el entorno").

```mermaid
erDiagram
    USER ||--o{ INSPECTION : "inspecciona / coordina"
    BRIDGE ||--o{ BRIDGE_DOCUMENT : "tiene"
    BRIDGE ||--o{ INSPECTION : "se le practican"
    INSPECTION ||--o{ INSPECTION_ELEMENT : "registra"
    INSPECTION ||--o{ SUBCATEGORY_RESULT : "produce (Ec.4)"
    INSPECTION ||--|| INSPECTION_RESULT : "produce (Ec.5)"

    WABIM_SUBCATEGORY ||--o{ WABIM_ELEMENT : "agrupa"
    WABIM_ELEMENT ||--o{ WABIM_SUBELEMENT : "agrupa"
    WABIM_SUBELEMENT ||--o{ WABIM_PATHOLOGY_TYPE : "admite"

    WABIM_ELEMENT ||--o{ INSPECTION_ELEMENT : "instancia"
    WABIM_SUBELEMENT ||--o{ INSPECTION_SUBELEMENT : "instancia"
    WABIM_PATHOLOGY_TYPE ||--o{ PATHOLOGY_RECORD : "instancia"

    INSPECTION_ELEMENT ||--o{ INSPECTION_SUBELEMENT : "contiene"
    INSPECTION_SUBELEMENT ||--o{ PATHOLOGY_RECORD : "contiene"
    INSPECTION_ELEMENT ||--|| ELEMENT_RESULT : "produce (Ec.3)"
    INSPECTION_ELEMENT ||--o{ PHOTO : "tiene"
    PATHOLOGY_RECORD ||--o{ PHOTO : "tiene"

    WABIM_SUBCATEGORY ||--o{ SUBCATEGORY_RESULT : "referencia"

    USER {
        string id PK
        string name
        string email UK
        string password_hash
        enum role
        bool active
    }
    BRIDGE {
        string id PK
        string code UK
        string name
        string municipality
        string department
        float latitude
        float longitude
        string route
        float km
        string structural_type_transverse
        string structural_type_longitudinal
        int number_of_spans
        float length
        float width
        string material
        int construction_year
        string owner
    }
    BRIDGE_DOCUMENT {
        string id PK
        string bridge_id FK
        string name
        string url
    }
    INSPECTION {
        string id PK
        string bridge_id FK
        datetime scheduled_date
        datetime executed_date
        string weather
        enum status
        enum priority
        string inspector_id FK
        string coordinator_id FK
    }
    WABIM_SUBCATEGORY {
        string code PK
        string name
        float cec "C.E.C. — Tabla 3 WABIM, editable"
    }
    WABIM_ELEMENT {
        string code PK
        string name
        string subcategory_code FK
        float ec "E.C. — Tabla 2 WABIM, editable"
    }
    WABIM_SUBELEMENT {
        string code PK
        string name
        string element_code FK
        float ic "I.C. — Tabla 1 WABIM, editable"
        enum unit
    }
    WABIM_PATHOLOGY_TYPE {
        string code PK
        string name
        string subelement_code FK
        enum unit
        float low_max "umbral Bajo — Tabla 6 WABIM, editable"
        float high_min "umbral Alto — Tabla 6 WABIM, editable"
    }
    INSPECTION_ELEMENT {
        string id PK
        string inspection_id FK
        string element_code FK
        string label
    }
    INSPECTION_SUBELEMENT {
        string id PK
        string inspection_element_id FK
        string subelement_code FK
        float total_measure "denominador Ec.1"
        float ic_used "snapshot auditable"
    }
    PATHOLOGY_RECORD {
        string id PK
        string inspection_subelement_id FK
        string pathology_code FK
        float measured_value "numerador Ec.1"
        float density_pct "Ec.1, snapshot"
        int dc_used "snapshot"
        float wap "Ec.2, snapshot"
    }
    PHOTO {
        string id PK
        string url
        string inspection_element_id FK
        string pathology_record_id FK
    }
    ELEMENT_RESULT {
        string id PK
        string inspection_element_id FK
        float dae "Ec.3"
        float sum_wap
        float sum_dc_ic
    }
    SUBCATEGORY_RESULT {
        string id PK
        string inspection_id FK
        string subcategory_code FK
        float dasc "Ec.4"
    }
    INSPECTION_RESULT {
        string id PK
        string inspection_id FK
        float dta "Ec.5"
        enum condition
    }
```

## Notas de diseño

* **Catálogo vs. captura de campo**: las tablas `wabim_*` son el *catálogo*
  (definiciones y coeficientes configurables). Las tablas `inspection_*` y
  `pathology_records` son la *captura de campo* (instancias reales medidas en
  una inspección concreta). Esta separación permite que el administrador
  recalibre coeficientes sin perder ni alterar el historial de inspecciones
  ya calculadas.
* **Trazabilidad / auditoría**: cada patología registrada guarda un
  "snapshot" del I.C., del rango D.C. usado y del resultado (`density_pct`,
  `dc_used`, `wap`) en el momento del cálculo. Igual para `element_results`
  (E.C. usado, D.A.E.) y `subcategory_results` (C.E.C. usado, D.A.S.C.). Así,
  cambiar un coeficiente en el catálogo **no** altera retroactivamente
  inspecciones ya calculadas — solo afecta a los cálculos que se ejecuten
  después del cambio.
* **Extensibilidad**: el modelo está preparado para anexar módulos futuros
  (BIM, procesamiento de imágenes con IA, drones) agregando nuevas tablas
  relacionadas por `inspection_id` / `bridge_id` sin tocar el núcleo WABIM.

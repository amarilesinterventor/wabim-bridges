# Manual de Usuario — WABIM Bridges (versión de demostración)

## 1. Ingreso al sistema

Abre `http://localhost:4000` en tu navegador. Si no tienes una sesión
iniciada, se te redirigirá a la pantalla de ingreso. Usa una de las cuentas
de ejemplo (creadas al ejecutar `npm run seed`):

| Correo                     | Contraseña      | Rol          | Puede editar coeficientes |
|-----------------------------|-----------------|--------------|:--------------------------:|
| admin@wabim.local           | admin123        | Administrador | Sí |
| inspector@wabim.local       | inspector123    | Inspector     | No |
| coordinador@wabim.local     | coordinador123  | Coordinador   | No |

## 2. Inventario de puentes

La pantalla principal ("Inventario de Puentes") muestra todos los puentes
registrados. Para registrar uno nuevo:

1. Presiona **"+ Registrar puente"**.
2. Completa código, nombre y los datos disponibles (municipio, coordenadas,
   tipo estructural, dimensiones, año de construcción, propietario, etc.).
   Solo código y nombre son obligatorios — puedes completar el resto después.
3. Presiona **Guardar**.

Haz clic en cualquier puente de la lista para ver su detalle.

## 3. Programar y abrir una inspección

En el detalle de un puente, presiona **"+ Programar inspección"**, define
fecha y prioridad, y confirma. Esto crea una inspección en estado
"SCHEDULED" que aparece en la lista de inspecciones de ese puente. Haz clic
sobre ella para abrir el editor de captura de campo.

## 4. Capturar la inspección (elementos → sub-elementos → patologías)

La estructura de captura sigue exactamente la jerarquía del Manual INVÍAS y
de la metodología WABIM:

```
Elemento (p.ej. "Juntas de expansión")
  └── Sub-elemento (p.ej. "Sello")  ← tiene una dimensión TOTAL (p.ej. 12.6 ml)
        └── Patología (p.ej. "Ausencia del sello")  ← tiene un valor MEDIDO (p.ej. 1.5 ml)
```

Pasos:

1. Presiona **"+ Agregar elemento"**, elige el elemento del Manual INVÍAS
   correspondiente (agrupados por subcategoría: Superficie y equipamiento,
   Subestructura, Superestructura en concreto, Superestructura metálica) y,
   opcionalmente, una etiqueta de ubicación (p.ej. "Pila 1", "Entrada").
2. Dentro de la tarjeta del elemento, presiona **"+ sub-elemento"**. Elige el
   sub-elemento (cada uno muestra su Coeficiente de Importancia I.C. entre
   paréntesis) e indica la **dimensión o cantidad TOTAL** de ese sub-elemento
   en el puente (en la unidad indicada: metros lineales, m², o unidades).
   Este valor es el denominador de la fórmula de densidad de daño — mide
   "cuánto sub-elemento hay", no cuánto está dañado.
3. Dentro del sub-elemento, presiona **"+ patología"**. Elige el tipo de
   daño (cada uno muestra su umbral Bajo/Alto) e indica el **valor medido**
   del daño (en la misma unidad del sub-elemento). Puedes agregar
   descripción y ubicación.
4. Repite para todos los elementos que hayas inspeccionado en campo.

Puedes eliminar cualquier elemento, sub-elemento o patología con el enlace
"eliminar" correspondiente.

## 5. Calcular el índice WABIM

Presiona **"Calcular WABIM"** en la parte superior de la lista de elementos.
El sistema:

1. Calcula la densidad de daño de cada patología registrada.
2. Determina su nivel de severidad (Bajo/Medio/Alto) y el Coeficiente de
   Densidad correspondiente.
3. Calcula el Grado de Afectación de cada elemento, de cada subcategoría, y
   finalmente el **Grado de Afectación Total (D.T.A.%)** del puente.
4. Muestra el resultado como una insignia de color (semáforo) con la
   condición y la recomendación de mantenimiento.
5. Debajo de la lista de elementos aparece la sección **"Trazabilidad del
   cálculo"**, con los 12 pasos del procedimiento y el detalle numérico
   completo (densidades, coeficientes, promedios ponderados y las 3
   ecuaciones de agregación) para auditoría técnica.

Puedes volver a presionar "Calcular WABIM" en cualquier momento después de
agregar o corregir datos; el resultado se actualiza.

## 6. Editar los coeficientes de la metodología (solo Administrador)

Ve a **"Coeficientes WABIM"** en el menú superior. Ahí puedes ver y (si
iniciaste sesión como Administrador) editar:

- El **C.E.C.** de cada una de las 4 subcategorías.
- El **E.C.** de cada elemento.
- El **I.C.** de cada sub-elemento.
- Los **umbrales Bajo/Alto** de cada tipo de patología.

Cada fila indica su **origen**: "WABIM" (dato publicado en el artículo
científico), "INVIAS" (definido en el Manual, coeficiente reutilizado por
afinidad) o "EXTENSION" (propuesto para cubrir el Manual por completo,
recomendado auditar antes de usar en un caso real). Los cambios se guardan
al salir del campo (o presionar "Guardar" en la tabla de patologías) y
aplican a partir del **siguiente** cálculo — las inspecciones ya calculadas
no se alteran.

## 7. Preguntas frecuentes

**¿Por qué no puedo ver una patología para el sub-elemento que agregué?**
El listado de patologías se filtra según el sub-elemento seleccionado —
cada sub-elemento solo admite las patologías que le corresponden según el
Manual INVÍAS (p.ej. "Sello" de una junta admite Obstrucción/Ruptura/
Ausencia del sello, no "Corrosión").

**¿Qué pasa si un sub-elemento no tiene ningún daño?**
Regístralo igual con un valor medido de 0 (o muy bajo) en al menos una
patología relevante, para que el sistema sepa que sí fue inspeccionado y lo
compute correctamente como "sin deterioro" en vez de excluirlo del cálculo.

**¿Puedo deshacer un cambio de coeficiente?**
Sí, simplemente vuelve a editar el valor al número anterior. El sistema no
mantiene aún un historial de cambios de coeficientes (ver Roadmap en
`README.md`).

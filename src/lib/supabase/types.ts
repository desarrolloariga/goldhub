/**
 * Tipos del esquema `smartvalehubgold`.
 *
 * Escritos a mano siguiendo la forma que produce `supabase gen types`, para
 * que el día que el CLI quede enlazado `npm run db:types` los sustituya sin
 * romper nada. Deben mantenerse alineados con supabase/migrations/.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/** Los filtros del tablero de ventas. El alcance por tienda lo pone la sesión. */
type VentasArgs = {
  p_desde?: string | null;
  p_hasta?: string | null;
  p_tienda_id?: number | null;
};

export type Database = {
  smartvalehubgold: {
    Tables: {
      tiendas: {
        Row: {
          id: number;
          nombre: string;
          /** Dos a cinco letras. Encabeza todos los códigos de la tienda. */
          prefijo: string;
          /** Último correlativo consumido. Lo mueve la base bajo cerrojo. */
          correlativo: number;
          /** Ruta dentro del bucket `logos-tiendas`. Nula = sin logotipo. */
          logo_ruta: string | null;
          logo_actualizado_en: string | null;
          direccion: string | null;
          telefono: string | null;
          /** QR fijo de la tienda: el que el cliente escanea para registrarse. */
          token: string;
          autorregistro: boolean;
          activo: boolean;
          fecha_creacion: string;
          fecha_actualizacion: string | null;
        };
        Insert: {
          nombre: string;
          prefijo: string;
          direccion?: string | null;
          telefono?: string | null;
          autorregistro?: boolean;
          activo?: boolean;
        };
        Update: {
          nombre?: string;
          prefijo?: string;
          direccion?: string | null;
          telefono?: string | null;
          logo_ruta?: string | null;
          logo_actualizado_en?: string | null;
          autorregistro?: boolean;
          activo?: boolean;
        };
        Relationships: [];
      };

      usuarios: {
        Row: {
          id: number;
          nombre: string;
          correo: string;
          telefono: string | null;
          contrasena_hash: string;
          rol: RolUsuario;
          /** Obligatoria si el rol es `tienda`; nula si es `admin`. */
          tienda_id: number | null;
          activo: boolean;
          ultimo_acceso: string | null;
          fecha_creacion: string;
          fecha_actualizacion: string | null;
        };
        Insert: {
          nombre: string;
          correo: string;
          contrasena_hash: string;
          telefono?: string | null;
          rol?: RolUsuario;
          tienda_id?: number | null;
          activo?: boolean;
        };
        Update: {
          nombre?: string;
          correo?: string;
          contrasena_hash?: string;
          telefono?: string | null;
          rol?: RolUsuario;
          tienda_id?: number | null;
          activo?: boolean;
          ultimo_acceso?: string | null;
        };
        Relationships: [];
      };

      sesiones: {
        Row: {
          id: number;
          usuario_id: number;
          token_hash: string;
          expira_en: string;
          ultima_actividad: string;
          user_agent: string | null;
          fecha_creacion: string;
        };
        Insert: {
          usuario_id: number;
          token_hash: string;
          expira_en: string;
          user_agent?: string | null;
        };
        Update: {
          expira_en?: string;
          ultima_actividad?: string;
        };
        Relationships: [];
      };

      contactos: {
        Row: {
          id: number;
          nombre: string;
          telefono: string;
          correo: string | null;
          fecha_creacion: string;
          fecha_actualizacion: string | null;
        };
        Insert: {
          nombre: string;
          telefono: string;
          correo?: string | null;
        };
        Update: {
          nombre?: string;
          correo?: string | null;
        };
        Relationships: [];
      };

      /** Solo lectura desde la aplicación: se escriben con `fn_emitir_vale`. */
      vales: {
        Row: {
          id: number;
          codigo: string;
          /** Identificador del enlace público. El código es para dictarlo. */
          token: string;
          tipo: TipoVale;
          correlativo: number;
          tienda_id: number;
          /** Nulo en los de autorregistro: los pide el propio cliente. */
          usuario_id: number | null;
          contacto_id: number;
          autorregistro: boolean;
          segmento: SegmentoA1 | null;
          origen: string | null;
          /** El vale que trajo a este cliente. Obligatorio en A4. */
          vale_origen_id: number | null;
          descuento_oro_pct: number;
          fecha_emision: string;
          fecha_vencimiento: string;
          anulado: boolean;
          motivo_anulacion: string | null;
          anulado_por: number | null;
          fecha_anulacion: string | null;
          fecha_creacion: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };

      /** Solo lectura: se escriben con `fn_registrar_redencion`. */
      redenciones: {
        Row: {
          id: number;
          vale_id: number;
          tienda_id: number;
          usuario_id: number | null;
          contacto_id: number;
          /** Un solo material: aquí solo se vende oro. */
          monto_oro: number;
          descuento_aplicado: number;
          /** Quién le pasó el vale. Nulo = lo usó el propio portador. */
          referido_por: string | null;
          /** Administrador que corrigió la compra. Nulo = tal como se capturó. */
          editada_por: number | null;
          fecha_edicion: string | null;
          fecha_creacion: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };

      configuracion: {
        Row: {
          id: number;
          clave: string;
          valor: string;
          tipo_dato: "numero" | "texto" | "booleano";
          descripcion: string | null;
          grupo: string;
          fecha_actualizacion: string | null;
        };
        Insert: {
          clave: string;
          valor: string;
          tipo_dato?: "numero" | "texto" | "booleano";
          descripcion?: string | null;
          grupo?: string;
        };
        Update: { valor?: string; descripcion?: string | null };
        Relationships: [];
      };
    };

    Views: {
      vw_vales_detalle: {
        Row: {
          id: number;
          codigo: string;
          token: string;
          tipo: TipoVale;
          correlativo: number;
          segmento: SegmentoA1 | null;
          origen: string | null;
          descuento_oro_pct: number;
          fecha_emision: string;
          fecha_vencimiento: string;
          anulado: boolean;
          motivo_anulacion: string | null;
          fecha_creacion: string;
          estado: EstadoVale;
          /** Negativo si ya venció. */
          dias_restantes: number;

          /** Nulo en autorregistro. */
          usuario_id: number | null;
          emisora: string | null;
          autorregistro: boolean;

          contacto_id: number;
          portador: string;
          portador_telefono: string;
          portador_correo: string | null;

          tienda_id: number;
          tienda: string;
          tienda_prefijo: string;
          /** Del bucket de logotipos. Nulo = la tienda no subió ninguno. */
          tienda_logo_ruta: string | null;
          tienda_logo_actualizado_en: string | null;

          total_redenciones: number;
          /** Compras que llegaron por difusión, no del propio portador. */
          redenciones_difundidas: number;
          ingreso_generado: number;
          descuento_otorgado: number;
          ultima_redencion: string | null;

          /** Cadena de referidos. */
          vale_origen_id: number | null;
          origen_codigo: string | null;
          origen_tipo: TipoVale | null;
          /** Nombre de quien refirió: el portador del vale de origen. */
          referidor: string | null;
          /** Cuántas personas llegaron enseñando ESTE vale. */
          referidos: number;
          referidos_convertidos: number;
          /** Un A4 convertido ya tiene su vale A1 emitido. */
          convertido: boolean;
        };
        Relationships: [];
      };

      vw_metricas_generales: {
        Row: {
          vales_emitidos: number;
          vales_activos: number;
          vales_vencidos: number;
          vales_anulados: number;
          redenciones: number;
          vales_con_compra: number;
          tasa_conversion: number | null;
          ingreso_total: number;
          ticket_promedio: number | null;
          descuento_total: number;
          descuento_sobre_venta: number | null;
        };
        Relationships: [];
      };

      vw_vales_por_tipo: {
        Row: {
          tipo: TipoVale;
          vales: number;
          redenciones: number;
          vales_con_compra: number;
          tasa_conversion: number | null;
          ingreso: number;
          descuento: number;
        };
        Relationships: [];
      };

      vw_desempeno_tiendas: {
        Row: {
          tienda_id: number;
          tienda: string;
          prefijo: string;
          activo: boolean;
          tiene_logo: boolean;
          /** Nombre de la cuenta de la tienda. Nulo si aún no tiene. */
          cuenta: string | null;
          cuenta_correo: string | null;
          ultimo_acceso: string | null;
          correlativo_actual: number;

          vales_emitidos: number;
          vales_a1: number;
          vales_a2: number;
          vales_a3: number;
          vales_a4: number;
          vales_vigentes: number;
          vales_vencidos: number;
          vales_anulados: number;

          vales_con_compra: number;
          redenciones: number;
          tasa_conversion: number | null;
          redenciones_por_vale: number | null;

          ingreso_generado: number;
          ticket_promedio: number | null;
          descuento_otorgado: number;
          descuento_sobre_venta: number | null;
          venta_por_vale: number | null;

          ultima_emision: string | null;
          ultima_venta: string | null;
        };
        Relationships: [];
      };

      vw_ranking_tiendas: {
        Row: {
          tienda_id: number;
          tienda: string;
          redenciones: number;
          vales_distintos: number;
          ingreso: number;
          descuento: number;
          ticket_promedio: number | null;
        };
        Relationships: [];
      };

      vw_contactos_detalle: {
        Row: {
          contacto_id: number;
          nombre: string;
          telefono: string;
          correo: string | null;
          fecha_alta: string;

          /** Puerta de entrada. Nulo = solo aparece como comprador. */
          tipo: TipoVale | null;
          vale_codigo: string | null;
          segmento: SegmentoA1 | null;
          origen: string | null;
          tienda_id: number | null;
          tienda: string | null;
          usuario_id: number | null;
          emisora: string | null;
          autorregistro: boolean;
          referidor: string | null;
          origen_codigo: string | null;

          vales: number;
          vales_a1: number;
          vales_a2: number;
          vales_a3: number;
          vales_a4: number;
          vales_vigentes: number;
          primer_vale: string | null;
          ultimo_vale: string | null;

          compras: number;
          gastado: number;
          ahorrado: number;
          ultima_compra: string | null;
          /** Dónde compró la última vez; puede no ser la tienda que lo captó. */
          tienda_compra: string | null;

          referidos: number;
        };
        Relationships: [];
      };

      vw_viralidad_a2: {
        Row: {
          vales_a2: number;
          redenciones_a2: number;
          redenciones_difundidas: number;
          porcentaje_difusion: number | null;
          redenciones_por_vale: number | null;
          alcance_maximo: number | null;
          vales_compartidos: number;
          ingreso_a2: number;

          /** Referidos que se presentaron en tienda con el vale de alguien. */
          referidos_a4: number;
          /** De esos, cuántos ya tienen su A1 emitido. */
          referidos_convertidos: number;
          ingreso_a4: number;
          referidos_desde_a2: number;
          referidos_desde_a1: number;
        };
        Relationships: [];
      };

      vw_actividad_diaria: {
        Row: {
          dia: string;
          vales_emitidos: number;
          redenciones: number;
          ingreso: number;
        };
        Relationships: [];
      };

      vw_ventas: {
        Row: {
          id: number;
          vale_id: number;
          contacto_id: number;
          tienda_id: number;
          tienda: string;
          monto_oro: number;
          descuento_aplicado: number;
          fecha_creacion: string;
          dia: string;
          dia_semana: number;
          hora: number;
        };
        Relationships: [];
      };
    };

    Functions: {
      fn_emitir_vale: {
        Args: {
          p_usuario_id: number;
          p_tipo: TipoVale;
          p_nombre: string;
          p_telefono: string;
          p_correo?: string | null;
          p_segmento?: SegmentoA1 | null;
          p_origen?: string | null;
          /** Solo el administrador la manda: una tienda usa la suya. */
          p_tienda_id?: number | null;
          p_vale_origen?: string | null;
        };
        Returns: Database["smartvalehubgold"]["Tables"]["vales"]["Row"];
      };

      fn_autorregistro: {
        Args: {
          p_token: string;
          p_nombre: string;
          p_telefono: string;
          p_correo?: string | null;
          p_codigo_referidor?: string | null;
        };
        Returns: Database["smartvalehubgold"]["Tables"]["vales"]["Row"];
      };

      fn_validar_vale: {
        Args: { p_codigo: string };
        Returns: {
          vale_id: number;
          codigo: string;
          token: string;
          tipo: TipoVale;
          segmento: SegmentoA1 | null;
          descuento_oro_pct: number;
          portador: string;
          portador_telefono: string;
          tienda_id: number;
          tienda: string;
          emisora: string;
          fecha_emision: string;
          fecha_vencimiento: string;
          estado: EstadoVale;
          redimible: boolean;
          total_redenciones: number;
        }[];
      };

      fn_registrar_redencion: {
        Args: {
          p_codigo: string;
          p_usuario_id: number;
          p_nombre: string;
          p_telefono: string;
          p_correo?: string | null;
          p_monto_oro: number;
          p_referido_por?: string | null;
          p_tienda_id?: number | null;
        };
        Returns: Database["smartvalehubgold"]["Tables"]["redenciones"]["Row"];
      };

      fn_anular_vale: {
        Args: { p_codigo: string; p_usuario_id: number; p_motivo: string };
        Returns: Database["smartvalehubgold"]["Tables"]["vales"]["Row"];
      };
      fn_reactivar_vale: {
        Args: { p_codigo: string; p_usuario_id: number };
        Returns: Database["smartvalehubgold"]["Tables"]["vales"]["Row"];
      };
      fn_eliminar_vale: {
        Args: { p_codigo: string; p_usuario_id: number };
        Returns: boolean;
      };

      fn_editar_redencion: {
        Args: {
          p_redencion_id: number;
          p_usuario_id: number;
          p_monto_oro: number;
          /** Sin nombre se conserva el comprador que ya tenía. */
          p_nombre?: string | null;
          p_telefono?: string | null;
          p_correo?: string | null;
          p_referido_por?: string | null;
        };
        Returns: Database["smartvalehubgold"]["Tables"]["redenciones"]["Row"];
      };
      fn_eliminar_redencion: {
        Args: { p_redencion_id: number; p_usuario_id: number };
        Returns: boolean;
      };

      fn_vales_por_vencer: {
        Args: { p_tienda_id?: number | null; p_dias?: number | null };
        Returns: {
          vale_id: number;
          codigo: string;
          token: string;
          tipo: TipoVale;
          portador: string;
          portador_telefono: string;
          tienda: string;
          descuento_oro_pct: number;
          fecha_vencimiento: string;
          dias_restantes: number;
        }[];
      };

      fn_metricas: {
        Args: { p_tienda_id?: number | null };
        Returns: Database["smartvalehubgold"]["Views"]["vw_metricas_generales"]["Row"][];
      };

      /**
       * Sobre qué tienda opera una cuenta. Revienta si no puede operar sobre
       * la que pide, o si la tienda está desactivada. Lo llama la capa de
       * servidor para lo que no pasa por SQL, como subir un logotipo.
       */
      fn_tienda_en_alcance: {
        Args: { p_usuario_id: number; p_tienda_id?: number | null };
        Returns: number;
      };
      fn_tienda_de_cuenta: {
        Args: { p_usuario_id: number };
        Returns: number | null;
      };

      fn_es_admin: { Args: { p_usuario_id: number }; Returns: boolean };
      fn_descuento_oro: { Args: Record<string, never>; Returns: number };
      fn_normalizar_telefono: { Args: { p_telefono: string }; Returns: string | null };
      fn_purgar_sesiones: { Args: Record<string, never>; Returns: number };

      fn_ventas_resumen: {
        Args: VentasArgs;
        Returns: {
          tickets: number;
          venta: number;
          descuento: number;
          ticket_promedio: number | null;
          clientes: number;
          vales_usados: number;
          primer_dia: string | null;
          ultimo_dia: string | null;
        }[];
      };
      fn_ventas_por_dia: {
        Args: VentasArgs;
        Returns: { dia: string; tickets: number; venta: number; descuento: number }[];
      };
      fn_ventas_por_tienda: {
        Args: VentasArgs;
        Returns: {
          tienda_id: number;
          tienda: string;
          tickets: number;
          venta: number;
          ticket_promedio: number | null;
        }[];
      };
      fn_ventas_mapa_calor: {
        Args: VentasArgs;
        Returns: { dia_semana: number; hora: number; tickets: number; venta: number }[];
      };
    };

    Enums: {
      rol_usuario: RolUsuario;
      tipo_vale: TipoVale;
      segmento_a1: SegmentoA1;
    };
    CompositeTypes: Record<string, never>;
  };
};

/* ── Alias de conveniencia ──────────────────────────────────────────────── */

/**
 * Las puertas de entrada, en orden. Es la lista, no el tipo, la que deben
 * usar quienes recorran los tipos o compongan patrones: así una puerta
 * nueva no deja atrás un sitio escrito a mano.
 */
export const TIPOS_VALE = ["A1", "A2", "A3", "A4"] as const;

export type TipoVale = (typeof TIPOS_VALE)[number];
export type SegmentoA1 = "A1-30" | "A1-60" | "A1-90" | "A1-VIP";

/** `tienda` ve solo la suya; `admin` las ve todas. Una cuenta por tienda. */
export type RolUsuario = "admin" | "tienda";

/** Derivado en SQL, no es una columna almacenada. */
export type EstadoVale = "activo" | "vencido" | "anulado";

type Esquema = Database["smartvalehubgold"];

export type Tabla<T extends keyof Esquema["Tables"]> =
  Esquema["Tables"][T]["Row"];
export type Vista<T extends keyof Esquema["Views"]> =
  Esquema["Views"][T]["Row"];

export type Usuario = Tabla<"usuarios">;
export type Tienda = Tabla<"tiendas">;
export type Contacto = Tabla<"contactos">;
export type Vale = Tabla<"vales">;
export type Redencion = Tabla<"redenciones">;
export type Configuracion = Tabla<"configuracion">;

export type ValeDetalle = Vista<"vw_vales_detalle">;
export type MetricasGenerales = Vista<"vw_metricas_generales">;
export type MetricasPorTipo = Vista<"vw_vales_por_tipo">;
export type DesempenoTienda = Vista<"vw_desempeno_tiendas">;
export type RankingTienda = Vista<"vw_ranking_tiendas">;
export type ContactoDetalle = Vista<"vw_contactos_detalle">;
export type ViralidadA2 = Vista<"vw_viralidad_a2">;
export type ActividadDiaria = Vista<"vw_actividad_diaria">;

export type ValeValidado =
  Esquema["Functions"]["fn_validar_vale"]["Returns"][number];
export type ValePorVencer =
  Esquema["Functions"]["fn_vales_por_vencer"]["Returns"][number];

/* ── Etiquetas para la interfaz ─────────────────────────────────────────── */

export const ETIQUETA_TIPO: Record<TipoVale, string> = {
  A1: "Cliente existente",
  A2: "Empleados y referidos",
  A3: "Visitante de tienda",
  A4: "Referido de un cliente",
};

export const DESCRIPCION_TIPO: Record<TipoVale, string> = {
  A1: "Llamada a la base histórica de la tienda",
  A2: "Prospección en frío, reutilizable y compartible",
  A3: "Registro en el punto de venta",
  A4: "Llegó a tienda porque alguien le enseñó su vale",
};

export const ETIQUETA_SEGMENTO: Record<SegmentoA1, string> = {
  "A1-30": "Compró hace 30 días",
  "A1-60": "Compró hace 60 días",
  "A1-90": "Compró hace 90 días",
  "A1-VIP": "Cliente VIP",
};

/**
 * Clasificación con la que salen todos los A1 nuevos.
 *
 * La campaña ofrece lo mismo a toda la base histórica, así que preguntar
 * cuándo compró por última vez era un paso que no cambiaba nada del vale. El
 * enum conserva los cuatro valores: los A1 ya emitidos guardan el suyo y los
 * reportes siguen separándolos.
 */
export const SEGMENTO_A1_FIJO: SegmentoA1 = "A1-VIP";

export const ETIQUETA_ROL: Record<RolUsuario, string> = {
  admin: "Administración",
  tienda: "Tienda",
};

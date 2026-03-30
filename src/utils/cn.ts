/**
 * @module cn
 * @description Utilitário para composição condicional de classes CSS.
 * Filtra valores falsy e junta os nomes restantes com espaço.
 * 
 * @example
 * cn("base", isActive && "active", className) // => "base active custom"
 */
export const cn = (...classes: any[]) => classes.filter(Boolean).join(' ');

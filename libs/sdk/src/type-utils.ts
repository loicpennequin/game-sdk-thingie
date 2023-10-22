import type { z } from 'zod';

export type JSONObject = { [k: string]: JSONValue };
export type JSONArray = JSONValue[];
export type JSONPrimitive = string | number | boolean | null;
export type JSONValue = JSONArray | JSONObject | JSONPrimitive;
export type ZodInferOrType<T> = T extends z.ZodTypeAny ? z.infer<T> : T;

export type ObjectKeys<T> = T extends object
  ? (keyof T)[]
  : T extends number
  ? []
  : T extends Array<any> | string
  ? string[]
  : never;

export type ArrayElement<A> = A extends readonly (infer T)[] ? T : never;
type DeepWriteable<T> = { -readonly [P in keyof T]: DeepWriteable<T[P]> };
type Cast<X, Y> = X extends Y ? X : Y;
type FromEntries<T> = T extends [infer Key, any][]
  ? { [K in Cast<Key, string>]: Extract<ArrayElement<T>, [K, any]>[1] }
  : { [key in string]: any };

export type FromEntriesWithReadOnly<T> = FromEntries<DeepWriteable<T>>;

export type StringKeys<T extends object> = Extract<keyof T, string>[];

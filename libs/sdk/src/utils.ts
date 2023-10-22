import { AnyFunction, AnyObject, FromEntriesWithReadOnly } from '@daria/shared';
import { ObjectKeys } from './type-utils';

export const objectKeys = <T extends AnyObject>(obj: T) =>
  Object.keys(obj) as ObjectKeys<T>;

export const objectFromEntries = <T>(obj: T): FromEntriesWithReadOnly<T> =>
  Object.fromEntries(obj as any) as FromEntriesWithReadOnly<T>;

export const asyncQueue = <T extends AnyFunction = AnyFunction>() => {
  const tasks: T[] = [];

  let isRunning = false;

  const process = async () => {
    if (!tasks.length) return;
    isRunning = true;

    while (tasks.length) {
      await tasks.shift()!();
    }

    isRunning = false;
  };

  return {
    add(task: T) {
      tasks.push(task);
      if (isRunning) return;

      process();
    }
  };
};

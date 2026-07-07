import { forwardRef, useCallback, useImperativeHandle } from 'react';
import { useCodemirror } from '../../../hooks/useCodemirror';
import styles from '../Moxia.module.css';

interface EditorProps {
  value: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  fontSize: number;
  readOnly?: boolean;
  /** Whether external value changes (e.g. switching chapters) enter the undo history. Defaults to false. */
  externalChangeInHistory?: boolean;
  className?: string;
}

/** Imperative handle exposed by Editor via ref. */
export interface EditorHandle {
  focus: () => void;
}

/**
 * CodeMirror 6 editor wrapper. Ports the original moxia QML Editor.qml.
 * Font size is passed in from the parent (via useMoxiaFontSize); IME, undo-loop prevention and
 * placeholder handling all live inside useCodemirror.
 */
const Editor = forwardRef<EditorHandle, EditorProps>(function Editor(
  { value, onChange, placeholder, fontSize, readOnly = false, externalChangeInHistory = false, className },
  ref,
) {
  const onChangeStable = useCallback(
    (v: string) => {
      onChange?.(v);
    },
    [onChange],
  );

  const { hostRef, focus } = useCodemirror({
    value,
    onChange: onChangeStable,
    placeholder,
    fontSize,
    readOnly,
    externalChangeInHistory,
  });

  useImperativeHandle(ref, () => ({ focus }), [focus]);

  return (
    <div
      ref={hostRef}
      className={`${styles.cmHost} ${className ?? ''}`}
      // CodeMirror fills this container.
    />
  );
});

export default Editor;

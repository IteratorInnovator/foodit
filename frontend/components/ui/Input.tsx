import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TextInputProps,
  ViewStyle,
  Pressable,
} from 'react-native';
import {
  Colors,
  Spacing,
  BorderRadius,
  FontSizes,
  FontWeights,
  Typography,
  ComponentTokens,
} from '@/constants/theme';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  containerStyle?: ViewStyle;
}

export function Input({
  label,
  error,
  hint,
  leftIcon,
  rightIcon,
  containerStyle,
  style,
  ...props
}: InputProps) {
  const [isFocused, setIsFocused] = useState(false);

  const getBorderColor = () => {
    if (error) return Colors.borderError;
    if (isFocused) return Colors.borderFocus;
    return Colors.border;
  };

  return (
    <View style={[styles.container, containerStyle]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View
        style={[
          styles.inputContainer,
          { borderColor: getBorderColor() },
          isFocused && styles.inputContainerFocused,
          error && styles.inputContainerError,
        ]}
      >
        {leftIcon && <View style={styles.leftIcon}>{leftIcon}</View>}
        <TextInput
          style={[
            styles.input,
            leftIcon ? styles.inputWithLeftIcon : undefined,
            rightIcon ? styles.inputWithRightIcon : undefined,
            style,
          ]}
          placeholderTextColor={Colors.textMuted}
          onFocus={(e) => {
            setIsFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setIsFocused(false);
            props.onBlur?.(e);
          }}
          {...props}
        />
        {rightIcon && <View style={styles.rightIcon}>{rightIcon}</View>}
      </View>
      {(error || hint) && (
        <Text style={[styles.helper, error && styles.helperError]}>
          {error || hint}
        </Text>
      )}
    </View>
  );
}

// TextArea variant
interface TextAreaProps extends InputProps {
  rows?: number;
}

export function TextArea({ rows = 4, style, ...props }: TextAreaProps) {
  return (
    <Input
      {...props}
      multiline
      numberOfLines={rows}
      style={[{ height: rows * 24, textAlignVertical: 'top' }, style]}
    />
  );
}

// Select / Dropdown component
interface SelectOption {
  label: string;
  value: string;
}

interface SelectProps {
  label?: string;
  placeholder?: string;
  options: SelectOption[];
  value?: string;
  onChange: (value: string) => void;
  error?: string;
  containerStyle?: ViewStyle;
}

export function Select({
  label,
  placeholder = 'Select an option',
  options,
  value,
  onChange,
  error,
  containerStyle,
}: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedOption = options.find((opt) => opt.value === value);

  return (
    <View style={[styles.container, containerStyle]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <Pressable
        style={[
          styles.selectTrigger,
          { borderColor: error ? Colors.borderError : Colors.border },
          isOpen && styles.selectTriggerOpen,
        ]}
        onPress={() => setIsOpen(!isOpen)}
      >
        <Text
          style={[
            styles.selectValue,
            !selectedOption && styles.selectPlaceholder,
          ]}
        >
          {selectedOption?.label || placeholder}
        </Text>
        <Text style={styles.selectChevron}>{isOpen ? '▲' : '▼'}</Text>
      </Pressable>

      {isOpen && (
        <View style={styles.selectDropdown}>
          {options.map((option) => (
            <Pressable
              key={option.value}
              style={[
                styles.selectOption,
                option.value === value && styles.selectOptionSelected,
              ]}
              onPress={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
            >
              <Text
                style={[
                  styles.selectOptionText,
                  option.value === value && styles.selectOptionTextSelected,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {error && <Text style={[styles.helper, styles.helperError]}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.xs,
  },
  label: {
    ...Typography.label,
    marginBottom: Spacing.xxs,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: ComponentTokens.input.height,
    backgroundColor: Colors.surface,
    borderWidth: ComponentTokens.input.borderWidth,
    borderRadius: ComponentTokens.input.borderRadius,
    paddingHorizontal: ComponentTokens.input.paddingHorizontal,
  },
  inputContainerFocused: {
    borderWidth: 2,
    paddingHorizontal: ComponentTokens.input.paddingHorizontal - 1,
  },
  inputContainerError: {
    backgroundColor: Colors.errorLight,
  },
  input: {
    flex: 1,
    fontSize: ComponentTokens.input.fontSize,
    color: Colors.text,
    paddingVertical: ComponentTokens.input.paddingVertical,
  },
  inputWithLeftIcon: {
    marginLeft: Spacing.sm,
  },
  inputWithRightIcon: {
    marginRight: Spacing.sm,
  },
  leftIcon: {
    marginRight: Spacing.xs,
  },
  rightIcon: {
    marginLeft: Spacing.xs,
  },
  helper: {
    ...Typography.bodySmall,
    marginTop: Spacing.xxs,
  },
  helperError: {
    color: Colors.error,
  },

  // Select styles
  selectTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: ComponentTokens.input.height,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderRadius: ComponentTokens.input.borderRadius,
    paddingHorizontal: ComponentTokens.input.paddingHorizontal,
  },
  selectTriggerOpen: {
    borderColor: Colors.borderFocus,
    borderWidth: 2,
    paddingHorizontal: ComponentTokens.input.paddingHorizontal - 1,
  },
  selectValue: {
    fontSize: ComponentTokens.input.fontSize,
    color: Colors.text,
  },
  selectPlaceholder: {
    color: Colors.textMuted,
  },
  selectChevron: {
    fontSize: 10,
    color: Colors.textMuted,
  },
  selectDropdown: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.xs,
    overflow: 'hidden',
    maxHeight: 200,
  },
  selectOption: {
    paddingVertical: Spacing.md,
    paddingHorizontal: ComponentTokens.input.paddingHorizontal,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  selectOptionSelected: {
    backgroundColor: Colors.primaryLight,
  },
  selectOptionText: {
    fontSize: FontSizes.md,
    color: Colors.text,
  },
  selectOptionTextSelected: {
    color: Colors.primary,
    fontWeight: FontWeights.semibold,
  },
});

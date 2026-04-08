import React, { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  fetchPlaceDetails,
  fetchPlaceSuggestions,
  type PlaceSuggestion,
} from '@/services/google-places';
import { useDebounce } from '@/hooks/use-debounce';
import {
  BorderRadius,
  Colors,
  FontWeights,
} from '@/constants/theme';

export type SelectedLocation = {
  placeId: string;
  name: string;
  address: string;
  lat?: number;
  lng?: number;
};

type LocationSearchInputProps = {
  value: string;
  onChangeValue: (value: string) => void;
  onSelectSuggestion: (suggestion: SelectedLocation) => void;
  placeholder?: string;
  fallbackLocations?: string[];
};

function formatSelectedLocation(suggestion: SelectedLocation) {
  return suggestion.address
    ? `${suggestion.name}\n${suggestion.address}`
    : suggestion.name;
}

function getEditableQuery(value: string) {
  return value.includes('\n') ? value.split('\n')[0] : value;
}

export default function LocationSearchInput({
  value,
  onChangeValue,
  onSelectSuggestion,
  placeholder = 'Search for a location',
  fallbackLocations = [],
}: LocationSearchInputProps) {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const debouncedQuery = useDebounce(query.trim(), 350);

  const shouldShowFallbackLocations = useMemo(
    () => debouncedQuery.length < 3 && fallbackLocations.length > 0,
    [debouncedQuery, fallbackLocations]
  );

  useEffect(() => {
    setQuery(getEditableQuery(value));
  }, [value]);

  useEffect(() => {
    let isMounted = true;

    async function loadSuggestions() {
      if (debouncedQuery.length < 3) {
        setSuggestions([]);
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        const results = await fetchPlaceSuggestions(debouncedQuery);

        if (!isMounted) {
          return;
        }

        setSuggestions(results);
      } catch (error) {
        console.error('Failed to load place suggestions', error);

        if (!isMounted) {
          return;
        }

        setSuggestions([]);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadSuggestions();

    return () => {
      isMounted = false;
    };
  }, [debouncedQuery]);

  function handleChangeText(text: string) {
    setQuery(text);
    onChangeValue(text);
    setShowSuggestions(true);
  }

  async function handleSelectSuggestion(suggestion: SelectedLocation) {
    try {
      const placeDetails = await fetchPlaceDetails(suggestion.placeId);
      const selectedLocation: SelectedLocation = {
        placeId: placeDetails.placeId,
        name: placeDetails.name || suggestion.name,
        address: placeDetails.address || suggestion.address,
        lat: placeDetails.lat,
        lng: placeDetails.lng,
      };

      const formattedValue = formatSelectedLocation(selectedLocation);

      setQuery(selectedLocation.name);
      onChangeValue(formattedValue);
      onSelectSuggestion(selectedLocation);
    } catch (error) {
      console.error('Failed to load place details', error);

      const formattedValue = formatSelectedLocation(suggestion);

      setQuery(suggestion.name);
      onChangeValue(formattedValue);
      onSelectSuggestion({ ...suggestion });
    } finally {
      setSuggestions([]);
      setShowSuggestions(false);
      setIsFocused(false);
    }
  }

  function handleSelectFallbackLocation(location: string) {
    setQuery(location);
    onChangeValue(location);
    setShowSuggestions(false);
  }

  return (
    <View>
      <View style={styles.inputContainer}>
        {!isFocused && value.includes('\n') ? (
          <Pressable
            style={{ flex: 1 }}
            onPress={() => {
              setIsFocused(true);
              setShowSuggestions(true);
            }}
          >
            {(() => {
              const [name, address] = value.split('\n');
              return (
                <View style={styles.selectedContent}>
                  <Text style={styles.selectedName}>{name}</Text>
                  <Text style={styles.selectedAddress}>{address}</Text>
                </View>
              );
            })()}
          </Pressable>
        ) : (
          <TextInput
            value={query}
            onChangeText={handleChangeText}
            onFocus={() => {
              setIsFocused(true);
              setShowSuggestions(true);
            }}
            onBlur={() => setIsFocused(false)}
            placeholder={placeholder}
            placeholderTextColor={Colors.textMuted}
            style={styles.input}
            textAlign="left"
            underlineColorAndroid="transparent"
          />
        )}

        {query.trim().length > 0 ? (
          <Pressable
            onPress={() => {
              setQuery('');
              onChangeValue('');
              setSuggestions([]);
              setShowSuggestions(false);
            }}
            hitSlop={8}
            style={styles.clearButton}
          >
            <Text style={styles.clearButtonText}>✕</Text>
          </Pressable>
        ) : null}
      </View>

      {showSuggestions && (isLoading || suggestions.length > 0 || shouldShowFallbackLocations || debouncedQuery.length >= 3) && (
        <View style={styles.dropdownList}>
          {isLoading ? (
            <Text style={styles.helperText}>Searching locations...</Text>
          ) : suggestions.length > 0 ? (
            suggestions.map((suggestion) => (
              <Pressable
                key={suggestion.placeId}
                style={styles.dropdownItem}
                onPress={() => {
                  handleSelectSuggestion({
                    placeId: suggestion.placeId,
                    name: suggestion.name,
                    address: suggestion.address,
                  });
                }}
              >
                <Text style={styles.placeName}>{suggestion.name}</Text>
                {!!suggestion.address && (
                  <Text style={styles.placeAddress}>{suggestion.address}</Text>
                )}
              </Pressable>
            ))
          ) : shouldShowFallbackLocations ? (
            fallbackLocations.map((location) => (
              <Pressable
                key={location}
                style={styles.dropdownItem}
                onPress={() => handleSelectFallbackLocation(location)}
              >
                <Text style={styles.dropdownItemText}>{location}</Text>
              </Pressable>
            ))
          ) : (
            <Text style={styles.helperText}>No matching places found.</Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  inputContainer: {
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: BorderRadius.md,
    paddingHorizontal: 14,
    height: 64,
    backgroundColor: Colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    height: '100%',
    paddingVertical: 0,
    color: Colors.text,
    fontSize: 15,
    lineHeight: 20,
    includeFontPadding: false,
  },
  clearButton: {
    marginLeft: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  clearButtonText: {
    color: Colors.textMuted,
    fontSize: 14,
  },
  dropdownList: {
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface,
    marginTop: 8,
    overflow: 'hidden',
  },
  dropdownItem: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  dropdownItemText: {
    color: Colors.text,
  },
  helperText: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: Colors.textMuted,
  },
  placeName: {
    color: Colors.text,
    fontWeight: FontWeights.semibold,
  },
  placeAddress: {
    marginTop: 4,
    color: Colors.textMuted,
    fontSize: 13,
  },
  selectedContent: {
    flex: 1,
    height: '100%',
    justifyContent: 'center',
  },
  selectedName: {
    color: Colors.text,
    fontWeight: FontWeights.semibold,
    fontSize: 15,
  },

  selectedAddress: {
    marginTop: 2,
    color: Colors.textMuted,
    fontSize: 13,
  },
});

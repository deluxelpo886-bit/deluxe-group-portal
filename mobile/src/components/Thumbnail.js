import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme';
import { CATEGORIES } from '../data/services';

// Placeholder equipment thumbnail (category-coloured tile with an icon).
// Real equipment photos can replace this once image upload is added.
const CATEGORY_TINT = {
  repair: colors.blue,
  marine: colors.navy2,
  testing: colors.green,
  rental: colors.orange,
  fleet: colors.goldDim,
};

export default function Thumbnail({ category, size = 64, radius = 12 }) {
  const cat = CATEGORIES.find((c) => c.id === category);
  const icon = cat ? cat.icon : '🧰';
  const tint = CATEGORY_TINT[category] || colors.steel;
  return (
    <View
      style={[
        styles.box,
        { width: size, height: size, borderRadius: radius, backgroundColor: tint + '22', borderColor: tint + '55' },
      ]}
    >
      <Text style={{ fontSize: size * 0.42 }}>{icon}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
});

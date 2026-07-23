import React from 'react';
import { Image } from 'react-native';
import { colors } from '../theme';
import { imageFor } from '../data/serviceImages';

// Real equipment/service photo. Resolves the image from the service id
// (falling back to the request's category).
export default function Thumbnail({ service, category, size = 64, radius = 12, style }) {
  return (
    <Image
      source={imageFor({ service, category })}
      style={[
        {
          width: size,
          height: size,
          borderRadius: radius,
          borderWidth: 1,
          borderColor: colors.line,
          backgroundColor: colors.panel2,
        },
        style,
      ]}
      resizeMode="cover"
    />
  );
}

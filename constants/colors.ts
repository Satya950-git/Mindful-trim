const Colors = {
  background: '#FAF8F5',
  cardBackground: '#FFFFFF',
  textPrimary: '#2D2D3A',
  textSecondary: '#8E8E9A',
  textTertiary: '#B8B8C4',
  border: '#EDEDF0',
  inputBackground: '#F4F3F0',
  
  mental: '#1f69f2',
  mentalLight: '#E8F0FE',
  mentalGradient: ['#1f69f2', '#1558d6'] as const,
  
  physical: '#23de64',
  physicalLight: '#E4FBF0',
  physicalGradient: ['#23de64', '#1cca56'] as const,
  
  social: '#db3f2c',
  socialLight: '#FDEAE8',
  socialGradient: ['#db3f2c', '#c53527'] as const,
  
  spiritual: '#882cf5',
  spiritualLight: '#F0E8FE',
  spiritualGradient: ['#882cf5', '#7520df'] as const,
  
  accent: '#1f69f2',
  success: '#23de64',
  warning: '#F2C94C',
  error: '#EB5757',
  
  white: '#FFFFFF',
  black: '#000000',
  
  light: {
    text: '#2D2D3A',
    background: '#FAF8F5',
    tint: '#1f69f2',
    tabIconDefault: '#B8B8C4',
    tabIconSelected: '#1f69f2',
  },
};

export const pillarColors: Record<string, { main: string; light: string; gradient: readonly [string, string] }> = {
  Mental: { main: Colors.mental, light: Colors.mentalLight, gradient: Colors.mentalGradient },
  Physical: { main: Colors.physical, light: Colors.physicalLight, gradient: Colors.physicalGradient },
  Social: { main: Colors.social, light: Colors.socialLight, gradient: Colors.socialGradient },
  Spiritual: { main: Colors.spiritual, light: Colors.spiritualLight, gradient: Colors.spiritualGradient },
};

export const pillarIcons: Record<string, string> = {
  Mental: 'psychology',
  Physical: 'fitness-center',
  Social: 'people',
  Spiritual: 'self-improvement',
};

export default Colors;

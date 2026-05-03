import React, { useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  Animated, 
  Dimensions, 
  Image,
  Linking
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/contexts/ThemeContext';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';

const { width } = Dimensions.get('window');

const AD_DATA = [
  {
    id: '1',
    title: 'SSW Mekki Mastery',
    sub: 'Kursus Pengolahan Logam',
    description: 'Kuasai materi SSW Mekki dengan simulasi ujian real-time.',
    price: 'Promo Rp 49k',
    icon: 'target',
    colors: ['#4F46E5', '#7C3AED'],
    image: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?q=80&w=200&h=200&auto=format&fit=crop'
  },
  {
    id: '2',
    title: 'JLPT N3 Grammar Pro',
    sub: 'Special Bundle',
    description: '500+ Pola kalimat N3 lengkap dengan audio native speaker.',
    price: 'Promo Rp 79k',
    icon: 'book-open',
    colors: ['#059669', '#10B981'],
    image: 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?q=80&w=200&h=200&auto=format&fit=crop'
  }
];

export const PremiumCourseAd = () => {
  const colors = useColors();
  const router = useRouter();
  const scrollX = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const handleEnroll = (item: any) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // Real registration link for the client
    const message = `Halo Admin, saya tertarik mendaftar kursus ${item.title}. Bisa minta info detailnya?`;
    const url = `https://wa.me/6281617791410?text=${encodeURIComponent(message)}`;
    Linking.openURL(url).catch(() => {
      // Fallback landing page
      Linking.openURL('https://antigravity-learn.com/enroll');
    });
  };

  const handleSeeAll = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push('/(tabs)/learn');
  };

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.05,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <Text style={[styles.title, { color: colors.text }]}>Kursus Rekomendasi</Text>
          <View style={styles.premiumBadge}>
            <Text style={styles.premiumText}>PREMIUM</Text>
          </View>
        </View>
        <TouchableOpacity onPress={handleSeeAll}>
          <Text style={[styles.seeMore, { color: colors.primary }]}>Lihat Semua</Text>
        </TouchableOpacity>
      </View>

      <Animated.ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false }
        )}
        scrollEventThrottle={16}
        contentContainerStyle={styles.scrollContent}
      >
        {AD_DATA.map((item, index) => {
          const inputRange = [
            (index - 1) * width,
            index * width,
            (index + 1) * width,
          ];

          const scale = scrollX.interpolate({
            inputRange,
            outputRange: [0.9, 1, 0.9],
            extrapolate: 'clamp',
          });

          return (
            <Animated.View 
              key={item.id} 
              style={[
                styles.cardContainer, 
                { transform: [{ scale }] }
              ]}
            >
              <TouchableOpacity activeOpacity={0.9} style={styles.card}>
                <LinearGradient
                  colors={item.colors as any}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.gradient}
                >
                  <View style={styles.cardContent}>
                    <View style={styles.leftContent}>
                      <View style={styles.tag}>
                        <Feather name="star" size={10} color="#FFD700" />
                        <Text style={styles.tagText}>{item.sub}</Text>
                      </View>
                      <Text style={styles.cardTitle}>{item.title}</Text>
                      <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text>
                      
                      <View style={styles.footer}>
                        <View style={styles.priceContainer}>
                          <Text style={styles.price}>{item.price}</Text>
                        </View>
                        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                          <TouchableOpacity 
                            style={styles.buyBtn}
                            onPress={() => handleEnroll(item)}
                          >
                            <Text style={styles.buyBtnText}>Daftar Now</Text>
                          </TouchableOpacity>
                        </Animated.View>
                      </View>
                    </View>
                    
                    <View style={styles.rightContent}>
                      <Image source={{ uri: item.image }} style={styles.image} />
                      <View style={styles.iconOverlay}>
                        <Feather name={item.icon as any} size={20} color="#fff" />
                      </View>
                    </View>
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>
          );
        })}
      </Animated.ScrollView>

      <View style={styles.pagination}>
        {AD_DATA.map((_, i) => {
          const opacity = scrollX.interpolate({
            inputRange: [(i - 1) * width, i * width, (i + 1) * width],
            outputRange: [0.3, 1, 0.3],
            extrapolate: 'clamp',
          });
          const scale = scrollX.interpolate({
            inputRange: [(i - 1) * width, i * width, (i + 1) * width],
            outputRange: [1, 1.5, 1],
            extrapolate: 'clamp',
          });
          return (
            <Animated.View
              key={i}
              style={[
                styles.dot,
                { opacity, transform: [{ scale }], backgroundColor: colors.primary }
              ]}
            />
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 15,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '900',
  },
  premiumBadge: {
    backgroundColor: '#FFD700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  premiumText: {
    fontSize: 8,
    fontWeight: '900',
    color: '#000',
  },
  seeMore: {
    fontSize: 13,
    fontWeight: '700',
  },
  scrollContent: {
    paddingHorizontal: 10,
  },
  cardContainer: {
    width: width - 20,
    paddingHorizontal: 10,
  },
  card: {
    borderRadius: 24,
    overflow: 'hidden',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.2,
    shadowRadius: 15,
  },
  gradient: {
    padding: 20,
  },
  cardContent: {
    flexDirection: 'row',
    gap: 15,
  },
  leftContent: {
    flex: 1,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 8,
  },
  tagText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#fff',
    textTransform: 'uppercase',
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#fff',
    marginBottom: 4,
  },
  cardDesc: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '500',
    lineHeight: 18,
    marginBottom: 15,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 'auto',
  },
  priceContainer: {
    backgroundColor: 'rgba(0,0,0,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  price: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFD700',
  },
  buyBtn: {
    backgroundColor: '#fff',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 12,
  },
  buyBtnText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#000',
  },
  rightContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: 80,
    height: 80,
    borderRadius: 20,
  },
  iconOverlay: {
    position: 'absolute',
    bottom: -5,
    right: -5,
    backgroundColor: 'rgba(0,0,0,0.3)',
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 15,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});

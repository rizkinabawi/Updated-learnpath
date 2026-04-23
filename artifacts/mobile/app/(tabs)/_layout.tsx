import { BlurView } from "expo-blur";
import { Tabs } from "expo-router";
import React from "react";
import { Platform, StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useTranslation } from "@/contexts/LanguageContext";

function TabIcon({
  name,
  focused,
  color,
}: {
  name: React.ComponentProps<typeof Feather>["name"];
  focused: boolean;
  color: string;
}) {
  return (
    <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
      <Feather name={name} size={21} color={color} />
    </View>
  );
}

export default function TabLayout() {
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";
  const { t } = useTranslation();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.tabInactive,
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Colors.white,
          borderTopWidth: 0,
          elevation: 0,
          height: isWeb ? 60 : 82,
          paddingBottom: isWeb ? 8 : 20,
          paddingTop: 6,
          shadowColor: "#0F1F3D",
          shadowOffset: { width: 0, height: -3 },
          shadowOpacity: 0.07,
          shadowRadius: 20,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "700",
          letterSpacing: 0.2,
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView intensity={90} tint="light" style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: Colors.white }]} />
          ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t.tab.home,
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="home" focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="learn"
        options={{
          title: t.tab.courses,
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="book-open" focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="practice"
        options={{
          title: t.tab.practice,
          tabBarIcon: ({ color, focused }) => (
            <View style={[styles.centerBtn, focused && styles.centerBtnActive]}>
              <Feather name="zap" size={22} color={focused ? "#fff" : Colors.textMuted} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: t.tab.progress,
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="bar-chart-2" focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t.tab.profile,
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="user" focused={focused} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    width: 38,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrapActive: {
    backgroundColor: Colors.primaryLight,
  },
  centerBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  centerBtnActive: {
    backgroundColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
});

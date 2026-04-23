import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useState } from "react";

const ONBOARDING_KEY = "@mobilelearning_onboarded";

interface OnboardingContextType {
  hasOnboarded: boolean | null;
  completeOnboarding: () => Promise<void>;
}

const OnboardingContext = createContext<OnboardingContextType>({
  hasOnboarded: null,
  completeOnboarding: async () => {},
});

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [hasOnboarded, setHasOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_KEY).then((val) => {
      setHasOnboarded(val === "true");
    });
  }, []);

  const completeOnboarding = async () => {
    await AsyncStorage.setItem(ONBOARDING_KEY, "true");
    setHasOnboarded(true);
  };

  return (
    <OnboardingContext.Provider value={{ hasOnboarded, completeOnboarding }}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  return useContext(OnboardingContext);
}

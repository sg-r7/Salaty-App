import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  AsrMadhab,
  CalculationMethodName,
  usePrayer,
} from "../../src/context/PrayerContext";
import {
  CityOption,
  detectCurrentLocation,
  searchCities,
  saveCity,
} from "../../src/services/locationService";
import { NotificationSettings } from "../../src/services/notificationService";
import {
  NotificationDiagnostics,
  getNotificationDiagnostics,
  openAppSettings,
  openBatteryOptimizationSettings,
  openExactAlarmSettings,
} from "../../src/services/notificationDiagnostics";

interface SettingRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  color?: string;
  onPress?: () => void;
  rightContent?: React.ReactNode;
  showArrow?: boolean;
}

const calculationMethods: Array<{
  id: CalculationMethodName;
  title: string;
  subtitle: string;
}> = [
  {
    id: "ummAlQura",
    title: "جامعة أم القرى",
    subtitle: "المعتمد في المملكة العربية السعودية",
  },
  {
    id: "muslimWorldLeague",
    title: "رابطة العالم الإسلامي",
    subtitle: "طريقة حساب عالمية شائعة",
  },
  {
    id: "egyptian",
    title: "الهيئة المصرية العامة للمساحة",
    subtitle: "المعتمد في مصر وبعض الدول العربية",
  },
  {
    id: "karachi",
    title: "جامعة العلوم الإسلامية - كراتشي",
    subtitle: "مناسب لبعض مناطق جنوب آسيا",
  },
];

const hijriOffsets = [-2, -1, 0, 1, 2];

function getMethodTitle(method: CalculationMethodName): string {
  const item = calculationMethods.find(
    (calculationMethod) => calculationMethod.id === method
  );

  return item?.title || "جامعة أم القرى";
}

function getMadhabTitle(madhab: AsrMadhab): string {
  return madhab === "hanafi" ? "حنفي" : "قياسي";
}

function getOffsetTitle(offset: number): string {
  if (offset === 0) {
    return "بدون تعديل";
  }

  if (offset > 0) {
    return `تقديم ${offset} ${offset === 1 ? "يوم" : "أيام"}`;
  }

  const absoluteOffset = Math.abs(offset);

  return `تأخير ${absoluteOffset} ${
    absoluteOffset === 1 ? "يوم" : "أيام"
  }`;
}

function getDiagnosticLabel(
  status: NotificationDiagnostics[keyof NotificationDiagnostics]
): string {
  if (status === "ready") {
    return "جاهز";
  }

  if (status === "needs-attention") {
    return "يحتاج مراجعة";
  }

  return "تحقق من إعدادات النظام";
}

function getDiagnosticColor(
  status: NotificationDiagnostics[keyof NotificationDiagnostics]
): string {
  return status === "ready" ? "#72efdd" : "#f6c667";
}

function SettingRow({
  icon,
  title,
  subtitle,
  color = "#72efdd",
  onPress,
  rightContent,
  showArrow = true,
}: SettingRowProps) {
  const content = (
    <View style={styles.settingRow}>
      <View
        style={[
          styles.settingIconContainer,
          { backgroundColor: `${color}20` },
        ]}
      >
        <Ionicons name={icon} size={21} color={color} />
      </View>

      <View style={styles.settingTextContainer}>
        <Text style={styles.settingTitle}>{title}</Text>

        {subtitle ? (
          <Text style={styles.settingSubtitle}>{subtitle}</Text>
        ) : null}
      </View>

      {rightContent}

      {showArrow ? (
        <Ionicons
          name="chevron-back"
          size={18}
          color="#687991"
        />
      ) : null}
    </View>
  );

  if (!onPress) {
    return content;
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.settingPressable,
        pressed && styles.settingPressablePressed,
      ]}
    >
      {content}
    </Pressable>
  );
}

function SelectionModal({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.selectionModal}>
          <View style={styles.modalHeader}>
            <Pressable
              onPress={onClose}
              style={styles.modalCloseButton}
            >
              <Ionicons name="close" size={23} color="#dce8f3" />
            </Pressable>

            <Text style={styles.modalTitle}>{title}</Text>

            <View style={styles.modalHeaderSpacer} />
          </View>

          <ScrollView
            contentContainerStyle={styles.selectionList}
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export default function SettingsTab() {
  const router = useRouter();

  const {
    location,
    calculationMethod,
    asrMadhab,
    hijriDateOffset,
    periodMode,
    notificationSettings,
    setLocation,
    setCalculationMethod,
    setAsrMadhab,
    setHijriDateOffset,
    setPeriodMode,
    updateNotificationSettings,
    refreshPrayerData,
  } = usePrayer();

  const [locationModalVisible, setLocationModalVisible] =
    useState(false);
  const [calculationModalVisible, setCalculationModalVisible] =
    useState(false);
  const [madhabModalVisible, setMadhabModalVisible] =
    useState(false);
  const [offsetModalVisible, setOffsetModalVisible] = useState(false);

  const [locationQuery, setLocationQuery] = useState("");
  const [detectingLocation, setDetectingLocation] =
    useState(false);
  const [savingLocation, setSavingLocation] = useState(false);
  const [diagnostics, setDiagnostics] =
    useState<NotificationDiagnostics | null>(null);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);

  const filteredCities = useMemo(
    () => searchCities(locationQuery),
    [locationQuery]
  );

  const refreshDiagnostics = async () => {
    setDiagnosticsLoading(true);
    try {
      setDiagnostics(await getNotificationDiagnostics());
    } finally {
      setDiagnosticsLoading(false);
    }
  };

  useEffect(() => {
    void refreshDiagnostics();
  }, []);

  const openDiagnosticsSettings = async (
    openSettings: () => Promise<boolean>
  ) => {
    await openSettings();
    await refreshDiagnostics();
  };

  const updateNotifications = async (
    changes: Partial<NotificationSettings>
  ) => {
    await updateNotificationSettings({
      ...notificationSettings,
      ...changes,
    });
  };

  const handleSupportPress = () => {
    Alert.alert(
      "المساعدة والدعم",
      "تواصل معنا مباشرة عبر الحسابات الرسمية:",
      [
        {
          text: "Instagram",
          onPress: () => {
            void Linking.openURL(
              "https://www.instagram.com/sg_r4?stkn=MWNjOTkxeWhhZnFkaA=="
            ).catch(() => undefined);
          },
        },
        {
          text: "Facebook",
          onPress: () => {
            void Linking.openURL(
              "https://www.facebook.com/share/14o7eYLfMYF/"
            ).catch(() => undefined);
          },
        },
        {
          text: "إلغاء",
          style: "cancel",
        },
      ]
    );
  };

  const handleDetectLocation = async () => {
    setDetectingLocation(true);

    try {
      const detectedLocation = await detectCurrentLocation();

      if (detectedLocation.source === "default") {
        Alert.alert(
          "تعذر تحديد الموقع",
          "لم يتم منح إذن الموقع. يمكنك اختيار مدينة يدوياً."
        );
        return;
      }

      await setLocation(detectedLocation);
      setLocationModalVisible(false);
      setLocationQuery("");
      await refreshPrayerData();

      Alert.alert(
        "تم تحديث الموقع",
        `تم اعتماد ${detectedLocation.city} لحساب المواقيت.`
      );
    } catch {
      Alert.alert(
        "خطأ",
        "تعذر تحديد موقعك حالياً. حاول مرة أخرى أو اختر مدينة يدوياً."
      );
    } finally {
      setDetectingLocation(false);
    }
  };

  const handleSelectCity = async (city: CityOption) => {
    setSavingLocation(true);

    try {
      const selectedLocation = await saveCity(city);

      await setLocation(selectedLocation);
      setLocationModalVisible(false);
      setLocationQuery("");
      await refreshPrayerData();
    } catch {
      Alert.alert(
        "خطأ",
        "تعذر حفظ المدينة المختارة. حاول مرة أخرى."
      );
    } finally {
      setSavingLocation(false);
    }
  };

  const handleSelectCalculationMethod = async (
    method: CalculationMethodName
  ) => {
    try {
      await setCalculationMethod(method);
      setCalculationModalVisible(false);
      await refreshPrayerData();
    } catch {
      Alert.alert(
        "خطأ",
        "تعذر حفظ طريقة حساب المواقيت."
      );
    }
  };

  const handleSelectMadhab = async (madhab: AsrMadhab) => {
    try {
      await setAsrMadhab(madhab);
      setMadhabModalVisible(false);
      await refreshPrayerData();
    } catch {
      Alert.alert("خطأ", "تعذر حفظ إعداد المذهب.");
    }
  };

  const handleSelectOffset = async (offset: number) => {
    try {
      await setHijriDateOffset(offset);
      setOffsetModalVisible(false);
    } catch {
      Alert.alert(
        "خطأ",
        "تعذر حفظ تعديل التاريخ الهجري."
      );
    }
  };

  const handlePeriodModeChange = async (enabled: boolean) => {
    try {
      await setPeriodMode(enabled);
      await updateNotifications({
        prayerNotifications: enabled
          ? false
          : notificationSettings.prayerNotifications,
      });
    } catch {
      Alert.alert(
        "خطأ",
        "تعذر تحديث وضع الدورة."
      );
    }
  };

  const handlePrayerNotificationsChange = async (
    enabled: boolean
  ) => {
    try {
      await updateNotifications({
        prayerNotifications: enabled,
      });
    } catch {
      Alert.alert(
        "خطأ",
        "تعذر تحديث تنبيهات الصلاة."
      );
    }
  };

  const handleAthkarNotificationsChange = async (
    enabled: boolean
  ) => {
    try {
      await updateNotifications({
        athkarNotifications: enabled,
      });
    } catch {
      Alert.alert(
        "خطأ",
        "تعذر تحديث تنبيهات الأذكار."
      );
    }
  };

  const handleFridayReminderChange = async (
    enabled: boolean
  ) => {
    try {
      await updateNotifications({
        fridayReminder: enabled,
      });
    } catch {
      Alert.alert(
        "خطأ",
        "تعذر تحديث تذكير سورة الكهف."
      );
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboardContainer}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>الإعدادات</Text>
              <Text style={styles.subtitle}>
                خصص تجربة صلاتي بما يناسبك
              </Text>
            </View>

            <View style={styles.headerIcon}>
              <Ionicons
                name="settings-outline"
                size={26}
                color="#72efdd"
              />
            </View>
          </View>

          <View style={styles.profileCard}>
            <View style={styles.profileIcon}>
              <Ionicons
                name="person-outline"
                size={25}
                color="#72efdd"
              />
            </View>

            <View style={styles.profileTextContainer}>
              <Text style={styles.profileTitle}>
                إعدادات العبادة
              </Text>
              <Text style={styles.profileSubtitle}>
                مواقيت وتنبيهات مناسبة لموقعك
              </Text>
            </View>

            <Ionicons
              name="sparkles-outline"
              size={22}
              color="#f6c667"
            />
          </View>

          <Text style={styles.sectionTitle}>الموقع</Text>

          <View style={styles.settingsCard}>
            <SettingRow
              icon="location-outline"
              title="الموقع الحالي"
              subtitle={`${location.city} · ${
                location.source === "gps"
                  ? "محدد عبر GPS"
                  : "موقع محفوظ"
              }`}
              onPress={() => setLocationModalVisible(true)}
              color="#72efdd"
            />

            <View style={styles.rowDivider} />

            <SettingRow
              icon="refresh-outline"
              title="تحديث المواقيت"
              subtitle="إعادة حساب أوقات الصلاة الآن"
              onPress={() => {
                refreshPrayerData().catch(() => {
                  Alert.alert(
                    "خطأ",
                    "تعذر تحديث المواقيت."
                  );
                });
              }}
              color="#77b8e8"
            />
          </View>

          <Text style={styles.sectionTitle}>حساب المواقيت</Text>

          <View style={styles.settingsCard}>
            <SettingRow
              icon="time-outline"
              title="طريقة الحساب"
              subtitle={getMethodTitle(calculationMethod)}
              onPress={() => setCalculationModalVisible(true)}
              color="#f6c667"
            />

            <View style={styles.rowDivider} />

            <SettingRow
              icon="sunny-outline"
              title="حساب وقت العصر"
              subtitle={`المذهب ${getMadhabTitle(asrMadhab)}`}
              onPress={() => setMadhabModalVisible(true)}
              color="#e8a87c"
            />

            <View style={styles.rowDivider} />

            <SettingRow
              icon="calendar-outline"
              title="تعديل التاريخ الهجري"
              subtitle={getOffsetTitle(hijriDateOffset)}
              onPress={() => setOffsetModalVisible(true)}
              color="#a78bfa"
            />
          </View>

          <Text style={styles.sectionTitle}>التنبيهات</Text>

          <View style={styles.settingsCard}>
            <SettingRow
              icon="notifications-outline"
              title="تنبيهات الصلاة"
              subtitle={
                periodMode
                  ? "متوقفة بسبب تفعيل وضع الدورة"
                  : "استقبال تنبيه عند دخول وقت الصلاة"
              }
              showArrow={false}
              color="#72efdd"
              rightContent={
                <Switch
                  value={
                    notificationSettings.prayerNotifications &&
                    !periodMode
                  }
                  disabled={periodMode}
                  onValueChange={handlePrayerNotificationsChange}
                  trackColor={{
                    false: "#35445d",
                    true: "#327e82",
                  }}
                  thumbColor={
                    notificationSettings.prayerNotifications &&
                    !periodMode
                      ? "#72efdd"
                      : "#a8b4c7"
                  }
                />
              }
            />

            <View style={styles.rowDivider} />

            <SettingRow
              icon="book-outline"
              title="تذكير الأذكار"
              subtitle="تذكير يومي بالأذكار"
              showArrow={false}
              color="#7dd3a8"
              rightContent={
                <Switch
                  value={notificationSettings.athkarNotifications}
                  onValueChange={handleAthkarNotificationsChange}
                  trackColor={{
                    false: "#35445d",
                    true: "#327e82",
                  }}
                  thumbColor={
                    notificationSettings.athkarNotifications
                      ? "#72efdd"
                      : "#a8b4c7"
                  }
                />
              }
            />

            <View style={styles.rowDivider} />

            <SettingRow
              icon="star-outline"
              title="تذكير سورة الكهف"
              subtitle="كل يوم جمعة"
              showArrow={false}
              color="#f6c667"
              rightContent={
                <Switch
                  value={notificationSettings.fridayReminder}
                  onValueChange={handleFridayReminderChange}
                  trackColor={{
                    false: "#35445d",
                    true: "#327e82",
                  }}
                  thumbColor={
                    notificationSettings.fridayReminder
                      ? "#72efdd"
                      : "#a8b4c7"
                  }
                />
              }
            />
          </View>

          <View style={styles.diagnosticsCard}>
            <View style={styles.diagnosticsHeader}>
              <View style={styles.diagnosticsIconContainer}>
                <Ionicons name="shield-checkmark-outline" size={22} color="#72efdd" />
              </View>
              <View style={styles.diagnosticsTextContainer}>
                <Text style={styles.diagnosticsTitle}>موثوقية إشعارات الأذان</Text>
                <Text style={styles.diagnosticsSubtitle}>
                  راجع الإعدادات التالية، خصوصاً على أجهزة شاومي.
                </Text>
              </View>
              <Pressable onPress={() => void refreshDiagnostics()} style={styles.refreshButton}>
                {diagnosticsLoading ? (
                  <ActivityIndicator size="small" color="#72efdd" />
                ) : (
                  <Ionicons name="refresh-outline" size={20} color="#72efdd" />
                )}
              </Pressable>
            </View>
            {diagnostics ? (
              <View style={styles.diagnosticsStatusList}>
                {([
                  ["الإشعارات", diagnostics.notifications],
                  ["قناة الأذان", diagnostics.prayerChannel],
                  ["المنبه الدقيق", diagnostics.exactAlarm],
                  ["تحسين البطارية", diagnostics.batteryOptimization],
                ] as const).map(([label, status]) => (
                  <View key={label} style={styles.diagnosticsStatusRow}>
                    <Text style={styles.diagnosticsStatusLabel}>{label}</Text>
                    <Text style={[styles.diagnosticsStatusValue, { color: getDiagnosticColor(status) }]}>
                      {getDiagnosticLabel(status)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
            <Text style={styles.xiaomiInstructions}>
              على أجهزة شاومي: فعّل التشغيل التلقائي، اختر «بلا قيود» للبطارية،
              اقفل التطبيق في التطبيقات الأخيرة، واسمح بإشعارات شاشة القفل والعائمة.
            </Text>
            <View style={styles.diagnosticsActions}>
              <Pressable onPress={() => void openDiagnosticsSettings(openExactAlarmSettings)} style={styles.diagnosticsAction}>
                <Ionicons name="alarm-outline" size={18} color="#102337" />
                <Text style={styles.diagnosticsActionText}>إعداد المنبه الدقيق</Text>
              </Pressable>
              <Pressable onPress={() => void openDiagnosticsSettings(openBatteryOptimizationSettings)} style={styles.diagnosticsAction}>
                <Ionicons name="battery-half-outline" size={18} color="#102337" />
                <Text style={styles.diagnosticsActionText}>إعداد البطارية</Text>
              </Pressable>
              <Pressable onPress={() => void openDiagnosticsSettings(openAppSettings)} style={styles.diagnosticsAction}>
                <Ionicons name="settings-outline" size={18} color="#102337" />
                <Text style={styles.diagnosticsActionText}>إعدادات التطبيق</Text>
              </Pressable>
            </View>
          </View>

          <Text style={styles.sectionTitle}>الوضع الخاص</Text>

          <View style={styles.periodCard}>
            <View style={styles.periodIconContainer}>
              <Ionicons
                name="heart-outline"
                size={26}
                color="#ee91ab"
              />
            </View>

            <View style={styles.periodTextContainer}>
              <Text style={styles.periodTitle}>
                وضع الدورة الشهرية
              </Text>
              <Text style={styles.periodSubtitle}>
                إيقاف تنبيهات الصلاة وتتبع الأداء مؤقتاً
              </Text>
            </View>

            <Switch
              value={periodMode}
              onValueChange={handlePeriodModeChange}
              trackColor={{
                false: "#35445d",
                true: "#81465e",
              }}
              thumbColor={periodMode ? "#ee91ab" : "#a8b4c7"}
            />
          </View>

          {periodMode ? (
            <View style={styles.periodActiveNotice}>
              <Ionicons
                name="information-circle-outline"
                size={20}
                color="#ee91ab"
              />
              <Text style={styles.periodActiveText}>
                وضع الدورة مفعّل. لن يتم إرسال تنبيهات الصلاة حتى
                يتم إيقافه.
              </Text>
            </View>
          ) : null}

          <Text style={styles.sectionTitle}>معلومات التطبيق</Text>

          <View style={styles.settingsCard}>
            <SettingRow
              icon="help-circle-outline"
              title="المساعدة والدعم"
              subtitle="تواصل معنا للاستفسارات والدعم الفني"
              onPress={handleSupportPress}
              color="#77b8e8"
            />

            <View style={styles.rowDivider} />

            <SettingRow
              icon="information-circle-outline"
              title="عن تطبيق صلاتي"
              subtitle="الإصدار 1.0.0"
              onPress={() =>
                Alert.alert(
                  "صلاتي",
                  "تطبيق صلاتي يساعدك على متابعة مواقيت الصلاة والعبادات اليومية."
                )
              }
              color="#a6b4c7"
            />
          </View>

          <Text style={styles.footerText}>
            صُمّم بحب لخدمة المسلمين
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>

      <SelectionModal
        visible={locationModalVisible}
        title="اختيار الموقع"
        onClose={() => {
          if (!detectingLocation && !savingLocation) {
            setLocationModalVisible(false);
          }
        }}
      >
        <View style={styles.locationActions}>
          <Pressable
            disabled={detectingLocation}
            onPress={handleDetectLocation}
            style={styles.detectLocationButton}
          >
            {detectingLocation ? (
              <ActivityIndicator color="#102337" />
            ) : (
              <Ionicons
                name="locate-outline"
                size={21}
                color="#102337"
              />
            )}

            <Text style={styles.detectLocationText}>
              {detectingLocation
                ? "جارٍ تحديد الموقع..."
                : "استخدام موقعي الحالي"}
            </Text>
          </Pressable>
        </View>

        <Text style={styles.modalSectionTitle}>
          البحث عن مدينة
        </Text>

        <View style={styles.searchContainer}>
          <Ionicons
            name="search-outline"
            size={20}
            color="#8090a8"
          />

          <TextInput
            value={locationQuery}
            onChangeText={setLocationQuery}
            placeholder="اكتب اسم المدينة..."
            placeholderTextColor="#718198"
            style={styles.searchInput}
            textAlign="right"
          />
        </View>

        {savingLocation ? (
          <ActivityIndicator
            color="#72efdd"
            size="small"
            style={styles.smallLoader}
          />
        ) : null}

        {filteredCities.map((city) => (
          <Pressable
            key={city.id}
            disabled={savingLocation}
            onPress={() => handleSelectCity(city)}
            style={({ pressed }) => [
              styles.cityRow,
              pressed && styles.cityRowPressed,
            ]}
          >
            <View style={styles.cityIconContainer}>
              <Ionicons
                name="location-outline"
                size={19}
                color="#72efdd"
              />
            </View>

            <View style={styles.cityTextContainer}>
              <Text style={styles.cityName}>{city.city}</Text>
              <Text style={styles.cityCountry}>{city.country}</Text>
            </View>

            <Ionicons
              name="chevron-back"
              size={18}
              color="#687991"
            />
          </Pressable>
        ))}
      </SelectionModal>

      <SelectionModal
        visible={calculationModalVisible}
        title="طريقة حساب المواقيت"
        onClose={() => setCalculationModalVisible(false)}
      >
        {calculationMethods.map((method) => {
          const selected = method.id === calculationMethod;

          return (
            <Pressable
              key={method.id}
              onPress={() =>
                handleSelectCalculationMethod(method.id)
              }
              style={[
                styles.optionRow,
                selected && styles.selectedOptionRow,
              ]}
            >
              <View style={styles.optionRadio}>
                {selected ? (
                  <View style={styles.optionRadioSelected} />
                ) : null}
              </View>

              <View style={styles.optionTextContainer}>
                <Text
                  style={[
                    styles.optionTitle,
                    selected && styles.selectedOptionTitle,
                  ]}
                >
                  {method.title}
                </Text>
                <Text style={styles.optionSubtitle}>
                  {method.subtitle}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </SelectionModal>

      <SelectionModal
        visible={madhabModalVisible}
        title="حساب وقت العصر"
        onClose={() => setMadhabModalVisible(false)}
      >
        <Pressable
          onPress={() => handleSelectMadhab("standard")}
          style={[
            styles.optionRow,
            asrMadhab === "standard" &&
              styles.selectedOptionRow,
          ]}
        >
          <View style={styles.optionRadio}>
            {asrMadhab === "standard" ? (
              <View style={styles.optionRadioSelected} />
            ) : null}
          </View>

          <View style={styles.optionTextContainer}>
            <Text
              style={[
                styles.optionTitle,
                asrMadhab === "standard" &&
                  styles.selectedOptionTitle,
              ]}
            >
              قياسي
            </Text>
            <Text style={styles.optionSubtitle}>
              الشافعي أو المالكي أو الحنبلي
            </Text>
          </View>
        </Pressable>

        <Pressable
          onPress={() => handleSelectMadhab("hanafi")}
          style={[
            styles.optionRow,
            asrMadhab === "hanafi" && styles.selectedOptionRow,
          ]}
        >
          <View style={styles.optionRadio}>
            {asrMadhab === "hanafi" ? (
              <View style={styles.optionRadioSelected} />
            ) : null}
          </View>

          <View style={styles.optionTextContainer}>
            <Text
              style={[
                styles.optionTitle,
                asrMadhab === "hanafi" &&
                  styles.selectedOptionTitle,
              ]}
            >
              حنفي
            </Text>
            <Text style={styles.optionSubtitle}>
              حساب العصر وفق المذهب الحنفي
            </Text>
          </View>
        </Pressable>
      </SelectionModal>

      <SelectionModal
        visible={offsetModalVisible}
        title="تعديل التاريخ الهجري"
        onClose={() => setOffsetModalVisible(false)}
      >
        {hijriOffsets.map((offset) => {
          const selected = offset === hijriDateOffset;

          return (
            <Pressable
              key={offset}
              onPress={() => handleSelectOffset(offset)}
              style={[
                styles.optionRow,
                selected && styles.selectedOptionRow,
              ]}
            >
              <View style={styles.optionRadio}>
                {selected ? (
                  <View style={styles.optionRadioSelected} />
                ) : null}
              </View>

              <View style={styles.optionTextContainer}>
                <Text
                  style={[
                    styles.optionTitle,
                    selected && styles.selectedOptionTitle,
                  ]}
                >
                  {getOffsetTitle(offset)}
                </Text>
                <Text style={styles.optionSubtitle}>
                  ضبط عرض التاريخ الهجري في التطبيق
                </Text>
              </View>
            </Pressable>
          );
        })}
      </SelectionModal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: "#0b1326",
    flex: 1,
  },

  keyboardContainer: {
    flex: 1,
  },

  container: {
    padding: 20,
    paddingBottom: 42,
  },

  header: {
    alignItems: "center",
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    marginBottom: 20,
  },

  title: {
    color: "#f5f7fb",
    fontSize: 28,
    fontWeight: "800",
    textAlign: "right",
  },

  subtitle: {
    color: "#8997ad",
    fontSize: 13,
    marginTop: 6,
    textAlign: "right",
  },

  headerIcon: {
    alignItems: "center",
    backgroundColor: "rgba(114, 239, 221, 0.13)",
    borderColor: "#2b6e7d",
    borderRadius: 16,
    borderWidth: 1,
    height: 52,
    justifyContent: "center",
    width: 52,
  },

  profileCard: {
    alignItems: "center",
    backgroundColor: "#183c52",
    borderColor: "#2b6e7d",
    borderRadius: 19,
    borderWidth: 1,
    flexDirection: "row-reverse",
    marginBottom: 24,
    padding: 16,
  },

  profileIcon: {
    alignItems: "center",
    backgroundColor: "rgba(114, 239, 221, 0.16)",
    borderRadius: 14,
    height: 48,
    justifyContent: "center",
    width: 48,
  },

  profileTextContainer: {
    flex: 1,
    marginHorizontal: 11,
  },

  profileTitle: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800",
    textAlign: "right",
  },

  profileSubtitle: {
    color: "#a8ced2",
    fontSize: 11,
    marginTop: 5,
    textAlign: "right",
  },

  sectionTitle: {
    color: "#eaf0f7",
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 11,
    marginTop: 4,
    textAlign: "right",
  },

  settingsCard: {
    backgroundColor: "#121f36",
    borderColor: "#243857",
    borderRadius: 17,
    borderWidth: 1,
    marginBottom: 22,
    overflow: "hidden",
  },
  diagnosticsCard: {
    backgroundColor: "#142c3c",
    borderColor: "#2b6e7d",
    borderRadius: 17,
    borderWidth: 1,
    marginBottom: 22,
    padding: 14,
  },
  diagnosticsHeader: {
    alignItems: "center",
    flexDirection: "row-reverse",
  },
  diagnosticsIconContainer: {
    alignItems: "center",
    backgroundColor: "rgba(114, 239, 221, 0.14)",
    borderRadius: 12,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  diagnosticsTextContainer: {
    flex: 1,
    marginHorizontal: 10,
  },
  diagnosticsTitle: {
    color: "#edf8f8",
    fontSize: 14,
    fontWeight: "800",
    textAlign: "right",
  },
  diagnosticsSubtitle: {
    color: "#9fc8cc",
    fontSize: 11,
    lineHeight: 17,
    marginTop: 4,
    textAlign: "right",
  },
  refreshButton: {
    alignItems: "center",
    borderColor: "#397f8b",
    borderRadius: 10,
    borderWidth: 1,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  diagnosticsStatusList: {
    borderTopColor: "#2b5262",
    borderTopWidth: 1,
    marginTop: 13,
    paddingTop: 8,
  },
  diagnosticsStatusRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  diagnosticsStatusLabel: {
    color: "#d1e4e6",
    fontSize: 11,
    textAlign: "right",
  },
  diagnosticsStatusValue: {
    fontSize: 11,
    fontWeight: "800",
    textAlign: "left",
  },
  xiaomiInstructions: {
    color: "#b5d1d3",
    fontSize: 11,
    lineHeight: 18,
    marginTop: 10,
    textAlign: "right",
  },
  diagnosticsActions: {
    gap: 8,
    marginTop: 12,
  },
  diagnosticsAction: {
    alignItems: "center",
    backgroundColor: "#72efdd",
    borderRadius: 11,
    flexDirection: "row-reverse",
    justifyContent: "center",
    minHeight: 40,
    paddingHorizontal: 10,
  },
  diagnosticsActionText: {
    color: "#102337",
    fontSize: 11,
    fontWeight: "800",
    marginRight: 7,
  },

  settingPressable: {
    backgroundColor: "transparent",
  },

  settingPressablePressed: {
    backgroundColor: "#182b47",
  },

  settingRow: {
    alignItems: "center",
    flexDirection: "row-reverse",
    minHeight: 76,
    paddingHorizontal: 14,
  },

  settingIconContainer: {
    alignItems: "center",
    borderRadius: 12,
    height: 42,
    justifyContent: "center",
    width: 42,
  },

  settingTextContainer: {
    flex: 1,
    marginHorizontal: 11,
  },

  settingTitle: {
    color: "#edf3f9",
    fontSize: 14,
    fontWeight: "800",
    textAlign: "right",
  },

  settingSubtitle: {
    color: "#8391a7",
    fontSize: 11,
    marginTop: 5,
    textAlign: "right",
  },

  rowDivider: {
    backgroundColor: "#253650",
    height: 1,
    marginRight: 66,
  },

  periodCard: {
    alignItems: "center",
    backgroundColor: "#2d2030",
    borderColor: "#704158",
    borderRadius: 17,
    borderWidth: 1,
    flexDirection: "row-reverse",
    marginBottom: 10,
    padding: 14,
  },

  periodIconContainer: {
    alignItems: "center",
    backgroundColor: "rgba(238, 145, 171, 0.16)",
    borderRadius: 13,
    height: 46,
    justifyContent: "center",
    width: 46,
  },

  periodTextContainer: {
    flex: 1,
    marginHorizontal: 11,
  },

  periodTitle: {
    color: "#ffe9ef",
    fontSize: 14,
    fontWeight: "800",
    textAlign: "right",
  },

  periodSubtitle: {
    color: "#caa7b2",
    fontSize: 11,
    lineHeight: 17,
    marginTop: 4,
    textAlign: "right",
  },

  periodActiveNotice: {
    alignItems: "flex-start",
    backgroundColor: "#352735",
    borderColor: "#704158",
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: "row-reverse",
    marginBottom: 22,
    padding: 12,
  },

  periodActiveText: {
    color: "#dcb7c2",
    flex: 1,
    fontSize: 11,
    lineHeight: 18,
    marginRight: 8,
    textAlign: "right",
  },

  footerText: {
    color: "#65758d",
    fontSize: 11,
    marginTop: 4,
    textAlign: "center",
  },

  modalOverlay: {
    alignItems: "center",
    backgroundColor: "rgba(3, 8, 18, 0.78)",
    flex: 1,
    justifyContent: "center",
    padding: 20,
  },

  selectionModal: {
    backgroundColor: "#101d33",
    borderColor: "#2b4567",
    borderRadius: 23,
    borderWidth: 1,
    maxHeight: "88%",
    padding: 17,
    width: "100%",
  },

  modalHeader: {
    alignItems: "center",
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    marginBottom: 13,
  },

  modalTitle: {
    color: "#f4f8fc",
    flex: 1,
    fontSize: 20,
    fontWeight: "800",
    textAlign: "right",
  },

  modalCloseButton: {
    alignItems: "center",
    backgroundColor: "#1c2d49",
    borderRadius: 10,
    height: 38,
    justifyContent: "center",
    marginLeft: 10,
    width: 38,
  },

  modalHeaderSpacer: {
    width: 38,
  },

  selectionList: {
    paddingBottom: 8,
  },

  locationActions: {
    marginBottom: 18,
  },

  detectLocationButton: {
    alignItems: "center",
    backgroundColor: "#72efdd",
    borderRadius: 13,
    flexDirection: "row-reverse",
    justifyContent: "center",
    paddingVertical: 13,
  },

  detectLocationText: {
    color: "#102337",
    fontSize: 13,
    fontWeight: "800",
    marginRight: 8,
  },

  modalSectionTitle: {
    color: "#eaf1f8",
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 9,
    textAlign: "right",
  },

  searchContainer: {
    alignItems: "center",
    backgroundColor: "#172640",
    borderColor: "#2b4565",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row-reverse",
    marginBottom: 12,
    paddingHorizontal: 12,
  },

  searchInput: {
    color: "#edf3f9",
    flex: 1,
    fontSize: 14,
    minHeight: 46,
    paddingHorizontal: 9,
  },

  smallLoader: {
    marginVertical: 10,
  },

  cityRow: {
    alignItems: "center",
    borderBottomColor: "#263a56",
    borderBottomWidth: 1,
    flexDirection: "row-reverse",
    minHeight: 66,
    paddingHorizontal: 4,
  },

  cityRowPressed: {
    backgroundColor: "#182d49",
  },

  cityIconContainer: {
    alignItems: "center",
    backgroundColor: "rgba(114, 239, 221, 0.12)",
    borderRadius: 10,
    height: 36,
    justifyContent: "center",
    width: 36,
  },

  cityTextContainer: {
    flex: 1,
    marginHorizontal: 10,
  },

  cityName: {
    color: "#edf3f9",
    fontSize: 14,
    fontWeight: "800",
    textAlign: "right",
  },

  cityCountry: {
    color: "#8391a7",
    fontSize: 11,
    marginTop: 4,
    textAlign: "right",
  },

  optionRow: {
    alignItems: "center",
    backgroundColor: "#172640",
    borderColor: "#2a4160",
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: "row-reverse",
    marginBottom: 10,
    padding: 14,
  },

  selectedOptionRow: {
    backgroundColor: "#1d3e4b",
    borderColor: "#72efdd",
  },

  optionRadio: {
    alignItems: "center",
    borderColor: "#71849e",
    borderRadius: 10,
    borderWidth: 1.5,
    height: 20,
    justifyContent: "center",
    width: 20,
  },

  optionRadioSelected: {
    backgroundColor: "#72efdd",
    borderRadius: 5,
    height: 10,
    width: 10,
  },

  optionTextContainer: {
    flex: 1,
    marginRight: 11,
  },

  optionTitle: {
    color: "#e8eff7",
    fontSize: 14,
    fontWeight: "800",
    textAlign: "right",
  },

  selectedOptionTitle: {
    color: "#72efdd",
  },

  optionSubtitle: {
    color: "#8391a7",
    fontSize: 11,
    lineHeight: 17,
    marginTop: 4,
    textAlign: "right",
  },
});

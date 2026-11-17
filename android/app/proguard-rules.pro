# Regras ProGuard para o JPS Almoxarifado
-keepclassmembers class com.jps.almoxarifado.MainActivity$AndroidBridge {
    @android.webkit.JavascriptInterface <methods>;
}

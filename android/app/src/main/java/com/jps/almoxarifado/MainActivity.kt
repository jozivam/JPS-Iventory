package com.jps.almoxarifado

import android.annotation.SuppressLint
import android.app.Activity
import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.print.PrintAttributes
import android.print.PrintManager
import android.view.View
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.ServiceWorkerController
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import com.google.android.material.button.MaterialButton

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var swipeRefresh: SwipeRefreshLayout
    private lateinit var progressBar: ProgressBar
    private lateinit var splashOverlay: LinearLayout
    private lateinit var offlineOverlay: LinearLayout
    private lateinit var btnRetry: MaterialButton

    private var filePathCallback: ValueCallback<Array<Uri>>? = null
    private var lastBackPressedAt: Long = 0L
    private var hasLoadedOnce: Boolean = false
    private var lastFailedUrl: String? = null
    private var networkCallback: ConnectivityManager.NetworkCallback? = null

    private val fileChooserLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val callback = filePathCallback ?: return@registerForActivityResult
        var results: Array<Uri>? = null

        if (result.resultCode == Activity.RESULT_OK) {
            val data = result.data
            if (data != null) {
                val clipData = data.clipData
                if (clipData != null && clipData.itemCount > 0) {
                    results = Array(clipData.itemCount) { i -> clipData.getItemAt(i).uri }
                } else if (data.data != null) {
                    results = arrayOf(data.data!!)
                }
            }
        }

        callback.onReceiveValue(results)
        filePathCallback = null
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webView)
        swipeRefresh = findViewById(R.id.swipeRefresh)
        progressBar = findViewById(R.id.progressBar)
        splashOverlay = findViewById(R.id.splashOverlay)
        offlineOverlay = findViewById(R.id.offlineOverlay)
        btnRetry = findViewById(R.id.btnRetry)

        configurarSwipeRefresh()
        configurarWebView()
        configurarBotaoVoltar()
        registrarMonitorDeRede()

        btnRetry.setOnClickListener {
            offlineOverlay.visibility = View.GONE
            atualizarModoCache(isOnline())
            val targetUrl = lastFailedUrl ?: BuildConfig.APP_URL
            lastFailedUrl = null
            webView.loadUrl(targetUrl)
        }

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState)
            splashOverlay.visibility = View.GONE
            hasLoadedOnce = true
        } else {
            // Sempre tenta carregar (usa rede se online, ou cache/Service Worker se offline na obra!)
            atualizarModoCache(isOnline())
            webView.loadUrl(BuildConfig.APP_URL)
        }
    }

    private fun atualizarModoCache(online: Boolean) {
        try {
            webView.settings.cacheMode = if (online) {
                WebSettings.LOAD_DEFAULT
            } else {
                WebSettings.LOAD_CACHE_ELSE_NETWORK
            }
        } catch (_: Exception) {
        }
    }

    private fun notificarRedeParaWeb(online: Boolean) {
        runOnUiThread {
            atualizarModoCache(online)
            try {
                webView.evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('jps-network-change', { detail: { online: $online } }));",
                    null
                )
            } catch (_: Exception) {
            }
        }
    }

    private fun registrarMonitorDeRede() {
        try {
            val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            val cb = object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: Network) {
                    notificarRedeParaWeb(true)
                }

                override fun onLost(network: Network) {
                    notificarRedeParaWeb(isOnline())
                }
            }
            cm.registerDefaultNetworkCallback(cb)
            networkCallback = cb
        } catch (_: Exception) {
        }
    }

    private fun configurarSwipeRefresh() {
        swipeRefresh.setColorSchemeColors(
            ContextCompat.getColor(this, R.color.primary),
            ContextCompat.getColor(this, R.color.accent)
        )

        // Só ativa pull-to-refresh quando a página estiver no topo
        swipeRefresh.setOnChildScrollUpCallback { _, _ ->
            webView.scrollY > 0
        }

        swipeRefresh.setOnRefreshListener {
            if (isOnline()) {
                offlineOverlay.visibility = View.GONE
                atualizarModoCache(true)
                webView.reload()
            } else {
                swipeRefresh.isRefreshing = false
                Toast.makeText(
                    this,
                    "Modo Offline — exibindo dados salvos no aparelho",
                    Toast.LENGTH_SHORT
                ).show()
            }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configurarWebView() {
        // Habilita Service Worker no WebView para funcionamento offline real
        try {
            val swController = ServiceWorkerController.getInstance()
            val swSettings = swController.serviceWorkerWebSettings
            swSettings.allowContentAccess = true
            swSettings.allowFileAccess = true
            swSettings.cacheMode = WebSettings.LOAD_DEFAULT
        } catch (_: Exception) {
        }

        val settings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.allowFileAccess = true
        settings.allowContentAccess = true
        settings.loadWithOverviewMode = true
        settings.useWideViewPort = true
        settings.builtInZoomControls = false
        settings.displayZoomControls = false
        settings.setSupportZoom(false)
        settings.cacheMode = if (isOnline()) {
            WebSettings.LOAD_DEFAULT
        } else {
            WebSettings.LOAD_CACHE_ELSE_NETWORK
        }
        settings.mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
        settings.userAgentString = "${settings.userAgentString} JPSAlmoxarifadoApp/1.1"

        val cookieManager = CookieManager.getInstance()
        cookieManager.setAcceptCookie(true)
        cookieManager.setAcceptThirdPartyCookies(webView, true)

        // Ponte JS para suportar window.print() nativo (Imprimir / Salvar PDF)
        webView.addJavascriptInterface(AndroidBridge(), "AndroidBridge")

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest?
            ): Boolean {
                val uri = request?.url ?: return false
                val scheme = uri.scheme?.lowercase() ?: ""
                val host = uri.host?.lowercase() ?: ""

                // Abre ligações, e-mail e WhatsApp nos aplicativos nativos do celular
                if (scheme == "tel" || scheme == "mailto" || scheme == "whatsapp" ||
                    host.contains("wa.me") || host.contains("api.whatsapp.com")
                ) {
                    return try {
                        startActivity(Intent(Intent.ACTION_VIEW, uri))
                        true
                    } catch (_: Exception) {
                        true
                    }
                }

                // Mantém a navegação do sistema dentro do próprio app
                if (scheme == "http" || scheme == "https") {
                    atualizarModoCache(isOnline())
                    return false
                }

                return try {
                    startActivity(Intent(Intent.ACTION_VIEW, uri))
                    true
                } catch (_: Exception) {
                    true
                }
            }

            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                super.onPageStarted(view, url, favicon)
                progressBar.visibility = View.VISIBLE
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                progressBar.visibility = View.GONE
                swipeRefresh.isRefreshing = false
                offlineOverlay.visibility = View.GONE

                if (!hasLoadedOnce) {
                    hasLoadedOnce = true
                    splashOverlay.animate()
                        .alpha(0f)
                        .setDuration(200)
                        .withEndAction {
                            splashOverlay.visibility = View.GONE
                            splashOverlay.alpha = 1f
                        }
                        .start()
                }

                // Integra window.print() com o serviço de impressão / PDF nativo do Android
                view?.evaluateJavascript(
                    """
                    (function() {
                        if (window.AndroidBridge && !window.__jpsPrintPatched) {
                            window.__jpsPrintPatched = true;
                            window.print = function() {
                                window.AndroidBridge.printPage();
                            };
                        }
                    })();
                    """.trimIndent(),
                    null
                )
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?
            ) {
                super.onReceivedError(view, request, error)
                if (request?.isForMainFrame == true) {
                    // Só mostra tela de offline total se o cache ainda não tiver nada salvo
                    lastFailedUrl = request.url?.toString() ?: BuildConfig.APP_URL
                    progressBar.visibility = View.GONE
                    swipeRefresh.isRefreshing = false
                    splashOverlay.visibility = View.GONE
                    if (!hasLoadedOnce) {
                        offlineOverlay.visibility = View.VISIBLE
                    }
                }
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                super.onProgressChanged(view, newProgress)
                progressBar.progress = newProgress
                if (newProgress >= 100) {
                    progressBar.visibility = View.GONE
                }
            }

            // Suporte a upload de arquivos (ex: Importação de planilhas Excel .xlsx/.xls/.csv)
            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                this@MainActivity.filePathCallback?.onReceiveValue(null)
                this@MainActivity.filePathCallback = filePathCallback

                return try {
                    val intent = Intent(Intent.ACTION_GET_CONTENT).apply {
                        addCategory(Intent.CATEGORY_OPENABLE)
                        type = "*/*"
                    }
                    val chooser = Intent.createChooser(intent, "Selecionar arquivo")
                    fileChooserLauncher.launch(chooser)
                    true
                } catch (_: Exception) {
                    this@MainActivity.filePathCallback = null
                    Toast.makeText(
                        this@MainActivity,
                        "Não foi possível abrir o seletor de arquivos.",
                        Toast.LENGTH_SHORT
                    ).show()
                    false
                }
            }
        }

        // Suporte a download de arquivos (Exportar Excel e Planilha Modelo)
        webView.setDownloadListener { url, userAgent, contentDisposition, mimeType, _ ->
            try {
                val request = DownloadManager.Request(Uri.parse(url))
                val fileName = URLUtil.guessFileName(url, contentDisposition, mimeType)
                val cookies = CookieManager.getInstance().getCookie(url)

                request.setMimeType(mimeType)
                if (!cookies.isNullOrBlank()) {
                    request.addRequestHeader("Cookie", cookies)
                }
                request.addRequestHeader("User-Agent", userAgent)
                request.setDescription(getString(R.string.downloading_file))
                request.setTitle(fileName)
                request.setNotificationVisibility(
                    DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED
                )
                request.setDestinationInExternalPublicDir(
                    Environment.DIRECTORY_DOWNLOADS,
                    fileName
                )

                val dm = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
                dm.enqueue(request)
                Toast.makeText(
                    this,
                    "Baixando $fileName em Downloads...",
                    Toast.LENGTH_LONG
                ).show()
            } catch (_: Exception) {
                try {
                    startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                } catch (_: Exception) {
                    Toast.makeText(
                        this,
                        "Erro ao iniciar o download do arquivo.",
                        Toast.LENGTH_SHORT
                    ).show()
                }
            }
        }
    }

    private fun configurarBotaoVoltar() {
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack()
                } else {
                    val now = System.currentTimeMillis()
                    if (now - lastBackPressedAt < 2000L) {
                        finish()
                    } else {
                        lastBackPressedAt = now
                        Toast.makeText(
                            this@MainActivity,
                            getString(R.string.press_back_again),
                            Toast.LENGTH_SHORT
                        ).show()
                    }
                }
            }
        })
    }

    private fun isOnline(): Boolean {
        val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = cm.activeNetwork ?: return false
        val capabilities = cm.getNetworkCapabilities(network) ?: return false
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onPause() {
        super.onPause()
        CookieManager.getInstance().flush()
    }

    override fun onDestroy() {
        super.onDestroy()
        networkCallback?.let { cb ->
            try {
                val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
                cm.unregisterNetworkCallback(cb)
            } catch (_: Exception) {
            }
        }
    }

    inner class AndroidBridge {
        @JavascriptInterface
        fun printPage() {
            runOnUiThread {
                try {
                    val printManager = getSystemService(Context.PRINT_SERVICE) as PrintManager
                    val jobName = "${getString(R.string.app_name)} - Documento"
                    val printAdapter = webView.createPrintDocumentAdapter(jobName)
                    printManager.print(jobName, printAdapter, PrintAttributes.Builder().build())
                } catch (_: Exception) {
                    Toast.makeText(
                        this@MainActivity,
                        "Não foi possível abrir o serviço de impressão.",
                        Toast.LENGTH_SHORT
                    ).show()
                }
            }
        }
    }
}

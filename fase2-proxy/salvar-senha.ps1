# salvar-senha.ps1 - regrava a senha do app (APP_TOKEN) no cofre do Worker e
# TESTA ao vivo se o proxy aceita a senha no final.
# ATENCAO: se um dia houver varias pessoas usando a foto, o APP_TOKEN e uma
# lista separada por virgulas - gravar por aqui substitui a lista inteira.
# IMPORTANTE: manter este arquivo 100% ASCII (sem acentos) - PowerShell 5.1.
$ErrorActionPreference = 'Continue'
Set-Location "C:\Users\serru\Desktop\JOGO dudu\fase2-proxy"

Write-Host ""
Write-Host "=== Regravar a senha do app (APP_TOKEN) no proxy ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Digite a senha que voce quer usar no app (letras e numeros,"
Write-Host "sem espacos, 12+ caracteres). Ela fica visivel para conferencia."
Write-Host "DEPOIS coloque esta MESMA senha no app do celular (aba Dados)."
Write-Host ""

$k = (Read-Host "Digite a senha aqui").Trim()

if ($k.Length -lt 8) {
  Write-Host ""
  Write-Host "ERRO: muito curta (minimo 8 caracteres). Nada foi salvo." -ForegroundColor Red
  return
}
if ($k -like 'sk-ant-*') {
  Write-Host ""
  Write-Host "ERRO: isso e a CHAVE da API, nao a senha do app! Nada foi salvo." -ForegroundColor Red
  Write-Host "(Para a chave, use o SALVAR-CHAVE. Aqui vai a senha que voce inventou.)"
  return
}
if ($k -match '[^\x21-\x7E]') {
  Write-Host ""
  Write-Host "ERRO: a senha tem acento, espaco ou simbolo especial." -ForegroundColor Red
  Write-Host "Use APENAS letras (sem acento) e numeros. Nada foi salvo."
  return
}

Write-Host ""
Write-Host ("Senha com " + $k.Length + " caracteres. Salvando (leva uns 15s)...") -ForegroundColor Cyan
$out = $k | npx.cmd wrangler secret put APP_TOKEN 2>&1 | Out-String
$out | Set-Content "$env:TEMP\salvar-senha.log" -Encoding utf8
Write-Host $out

Write-Host "Testando a senha ao vivo (ate 1 minuto, aguarde)..." -ForegroundColor Cyan

$status = 0
for ($i = 1; $i -le 12; $i++) {
  Start-Sleep -Seconds 5
  $status = 0
  try {
    $r = Invoke-WebRequest -Method Post -Uri "https://diario-alimentar-proxy.azimoov.workers.dev" -Headers @{ 'X-App-Token' = $k; 'Content-Type' = 'application/json' } -Body '{}' -UseBasicParsing
    $status = [int]$r.StatusCode
  } catch {
    if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode.value__ }
  }
  ("tentativa " + $i + ": status " + $status) | Add-Content "$env:TEMP\salvar-senha.log" -Encoding utf8
  Write-Host ("  tentativa " + $i + "/12: resposta " + $status)
  if ($status -eq 400) { break }
}

Write-Host ""
if ($status -eq 400) {
  Write-Host ">>> VERIFICADO: o proxy aceitou a senha! <<<" -ForegroundColor Green
  Write-Host ""
  Write-Host "ULTIMO PASSO: no celular, abra o app > aba Dados >"
  Write-Host "'Registro por foto' > apague o campo senha e digite esta mesma."
} elseif ($status -eq 401) {
  Write-Host ">>> FALHOU: o proxy ainda recusa a senha (401). <<<" -ForegroundColor Red
  Write-Host "Avise o Claude - ele le o relatorio sozinho."
} else {
  Write-Host (">>> Resposta inesperada do proxy: " + $status + " - avise o Claude. <<<") -ForegroundColor Yellow
}

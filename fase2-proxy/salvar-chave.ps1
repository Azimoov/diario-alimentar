# salvar-chave.ps1 - grava a ANTHROPIC_API_KEY no cofre do Worker, com
# verificacao real no final e log em %TEMP%\salvar-chave.log (o log guarda a
# SAIDA do comando, nunca a chave).
# IMPORTANTE: manter este arquivo 100% ASCII (sem acentos/travessoes) - o
# PowerShell 5.1 le .ps1 sem BOM como ANSI e caracteres especiais o quebram.
$ErrorActionPreference = 'Continue'
Set-Location "C:\Users\serru\Desktop\JOGO dudu\fase2-proxy"

Write-Host ""
Write-Host "=== Salvar a chave da API no proxy (Diario Alimentar) ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Copie a chave sk-ant-... (console.anthropic.com)"
Write-Host "2. Cole aqui com CLIQUE-DIREITO do mouse (a chave fica visivel)"
Write-Host "3. Confira se veio inteira e aperte Enter"
Write-Host ""

$k = (Read-Host "Cole a chave aqui").Trim()

if ($k -notlike 'sk-ant-*') {
  Write-Host ""
  Write-Host "ERRO: isso nao parece uma chave sk-ant-...  Nada foi salvo." -ForegroundColor Red
  Write-Host "Feche a janela e tente de novo."
  return
}

Write-Host ""
Write-Host ("Chave com " + $k.Length + " caracteres. Salvando (leva uns 15s)...") -ForegroundColor Cyan
$out = $k | npx.cmd wrangler secret put ANTHROPIC_API_KEY 2>&1 | Out-String
$out | Set-Content "$env:TEMP\salvar-chave.log" -Encoding utf8
Write-Host $out

Write-Host "Verificando se realmente salvou..." -ForegroundColor Cyan
$list = npx.cmd wrangler secret list 2>$null | Out-String
$list | Add-Content "$env:TEMP\salvar-chave.log" -Encoding utf8

Write-Host ""
if ($list -match 'ANTHROPIC_API_KEY') {
  Write-Host ">>> VERIFICADO: chave salva no cofre com sucesso! <<<" -ForegroundColor Green
  Write-Host "Pode fechar esta janela e avisar o Claude."
} else {
  Write-Host ">>> FALHOU: a chave NAO foi salva. <<<" -ForegroundColor Red
  Write-Host "Avise o Claude que ele le o relatorio do erro sozinho."
}

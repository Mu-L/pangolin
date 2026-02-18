package main

import (
	"github.com/charmbracelet/huh"
	"github.com/charmbracelet/lipgloss"
)

// Pangolin brand colors (converted from oklch to hex)
var (
	// Primary orange/amber - oklch(0.6717 0.1946 41.93)
	primaryColor = lipgloss.AdaptiveColor{Light: "#D97706", Dark: "#F59E0B"}
	// Muted foreground
	mutedColor = lipgloss.AdaptiveColor{Light: "#737373", Dark: "#A3A3A3"}
	// Success green
	successColor = lipgloss.AdaptiveColor{Light: "#16A34A", Dark: "#22C55E"}
	// Error red - oklch(0.577 0.245 27.325)
	errorColor = lipgloss.AdaptiveColor{Light: "#DC2626", Dark: "#EF4444"}
	// Normal text
	normalFg = lipgloss.AdaptiveColor{Light: "#171717", Dark: "#FAFAFA"}
)

// ThemePangolin returns a huh theme using Pangolin brand colors
func ThemePangolin() *huh.Theme {
	t := huh.ThemeBase()

	// Focused state styles
	t.Focused.Base = t.Focused.Base.BorderForeground(primaryColor)
	t.Focused.Title = t.Focused.Title.Foreground(primaryColor).Bold(true)
	t.Focused.Description = t.Focused.Description.Foreground(mutedColor)
	t.Focused.ErrorIndicator = t.Focused.ErrorIndicator.Foreground(errorColor)
	t.Focused.ErrorMessage = t.Focused.ErrorMessage.Foreground(errorColor)
	t.Focused.SelectSelector = t.Focused.SelectSelector.Foreground(primaryColor)
	t.Focused.NextIndicator = t.Focused.NextIndicator.Foreground(primaryColor)
	t.Focused.PrevIndicator = t.Focused.PrevIndicator.Foreground(primaryColor)
	t.Focused.Option = t.Focused.Option.Foreground(normalFg)
	t.Focused.SelectedOption = t.Focused.SelectedOption.Foreground(primaryColor)
	t.Focused.SelectedPrefix = lipgloss.NewStyle().Foreground(successColor).SetString("✓ ")
	t.Focused.UnselectedPrefix = lipgloss.NewStyle().Foreground(mutedColor).SetString("  ")
	t.Focused.FocusedButton = t.Focused.FocusedButton.Foreground(lipgloss.Color("#FFFFFF")).Background(primaryColor)
	t.Focused.BlurredButton = t.Focused.BlurredButton.Foreground(normalFg).Background(lipgloss.AdaptiveColor{Light: "#E5E5E5", Dark: "#404040"})
	t.Focused.TextInput.Cursor = t.Focused.TextInput.Cursor.Foreground(primaryColor)
	t.Focused.TextInput.Prompt = t.Focused.TextInput.Prompt.Foreground(primaryColor)

	// Blurred state inherits from focused but with hidden border
	t.Blurred = t.Focused
	t.Blurred.Base = t.Focused.Base.BorderStyle(lipgloss.HiddenBorder())
	t.Blurred.Title = t.Blurred.Title.Foreground(mutedColor).Bold(false)
	t.Blurred.TextInput.Prompt = t.Blurred.TextInput.Prompt.Foreground(mutedColor)

	return t
}
